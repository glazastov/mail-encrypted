/* mailcow PGP storage encryption plugin.

   Replaces the message stream on save with the output of an external filter
   program, so that mail is encrypted before it ever reaches the mail store.
   Unlike the Sieve based approach this covers every write path: LMTP
   delivery, IMAP APPEND (Sent, Drafts) and doveadm save.

   The plugin never fails a save. If anything goes wrong the original,
   unencrypted message is stored instead. */

#include "lib.h"
#include "istream.h"
#include "ostream.h"
#include "iostream-temp.h"
#include "module-context.h"
#include "mail-user.h"
#include "mail-storage-private.h"
#include "mailbox-list.h"
#include "restrict-access.h"
#include "program-client.h"

#define PGP_STORAGE_DEFAULT_BIN \
	"/etc/dovecot/sieve-pipe-bin/mailcow-pgp-storage-encrypt"
#define PGP_STORAGE_DEFAULT_TIMEOUT_SECS 120

const char *mail_pgp_storage_plugin_version = DOVECOT_ABI_VERSION;

/* What to do when a message cannot be encrypted. Storing it in the clear keeps
   mail flowing at the cost of the guarantee the feature exists to provide, so
   it must be a deliberate choice rather than a default nobody noticed. */
/* Only two modes are honest here. A permanent refusal is not reachable:
   mail_deliver() maps every storage error except NOQUOTA to
   MAIL_DELIVER_ERROR_TEMPORARY, so LMTP always answers 451 no matter which
   mail_error we set. */
enum pgp_failure_mode {
	PGP_FAILURE_DELIVER = 0,	/* store unencrypted */
	PGP_FAILURE_DEFER,		/* refuse; 451 on LMTP, error on APPEND */
};

struct pgp_storage_user {
	union mail_user_module_context module_ctx;
	const char *bin_path;
	unsigned int timeout_msecs;
	enum pgp_failure_mode failure_mode;
	bool enabled;
};

struct pgp_storage_mailbox {
	union mailbox_module_context module_ctx;
};

static MODULE_CONTEXT_DEFINE_INIT(pgp_storage_user_module,
				  &mail_user_module_register);
static MODULE_CONTEXT_DEFINE_INIT(pgp_storage_storage_module,
				  &mail_storage_module_register);

#define PGP_STORAGE_USER_CONTEXT(obj) \
	MODULE_CONTEXT(obj, pgp_storage_user_module)
#define PGP_STORAGE_CONTEXT(obj) \
	MODULE_CONTEXT_REQUIRE(obj, pgp_storage_storage_module)

/* lib-program-client calls env_clean() before exec(), so anything the filter
   needs has to be handed over explicitly. PATH matters: the filter shells out
   to gpg by name. */
static const char *const pgp_storage_forward_env[] = {
	"PATH", "DBNAME", "DBUSER", "DBPASS",
	"PGP_STORAGE_DEBUG", "PGP_STORAGE_DEBUG_LOG", NULL
};

static struct istream *
pgp_storage_run_filter(struct mailbox *box, struct pgp_storage_user *puser,
		       struct istream *input, bool *encrypted_r)
{
	struct mail_user *user = box->storage->user;
	const char *temp_prefix = mailbox_list_get_temp_prefix(box->list);
	struct program_client_settings set;
	struct program_client *pclient;
	struct ostream *temp_output;
	struct istream *original, *encrypted = NULL;
	enum program_client_exit_status status;
	unsigned int i;
	uoff_t size;

	*encrypted_r = FALSE;

	/* Buffer the message up front. program_client consumes the input
	   stream, and the input from an IMAP APPEND is not seekable, so
	   without this copy there would be nothing left to fall back to. */
	temp_output = iostream_temp_create(temp_prefix, 0);
	if (o_stream_send_istream(temp_output, input) !=
	    OSTREAM_SEND_ISTREAM_RESULT_FINISHED) {
		e_error(user->event, "pgp_storage: failed to buffer message: %s",
			o_stream_get_error(temp_output));
		o_stream_destroy(&temp_output);
		return NULL;
	}
	original = iostream_temp_finish(&temp_output, IO_BLOCK_SIZE);

	i_zero(&set);
	restrict_access_init(&set.restrict_set);
	set.allow_root = TRUE;
	set.input_idle_timeout_msecs = puser->timeout_msecs;
	set.event = user->event;

	pclient = program_client_local_create(puser->bin_path, NULL, &set);

	for (i = 0; pgp_storage_forward_env[i] != NULL; i++) {
		const char *value = getenv(pgp_storage_forward_env[i]);

		if (value != NULL)
			program_client_set_env(pclient,
					       pgp_storage_forward_env[i],
					       value);
	}
	program_client_set_env(pclient, "PGP_STORAGE_RECIPIENT", user->username);

	program_client_set_input(pclient, original);
	program_client_set_output_seekable(pclient, temp_prefix);

	status = program_client_run(pclient);
	if (status == PROGRAM_CLIENT_EXIT_STATUS_SUCCESS) {
		/* iostream_temp_finish() hands ownership over to us, so this
		   stream stays valid past program_client_destroy(). */
		encrypted = program_client_get_output_seekable(pclient);
	} else {
		e_error(user->event,
			"pgp_storage: filter %s failed (status %d)",
			puser->bin_path, (int)status);
	}
	program_client_destroy(&pclient);

	if (encrypted != NULL) {
		if (i_stream_get_size(encrypted, TRUE, &size) > 0 && size > 0) {
			i_stream_unref(&original);
			*encrypted_r = TRUE;
			return encrypted;
		}
		e_error(user->event, "pgp_storage: filter produced no output");
		i_stream_unref(&encrypted);
	}

	i_stream_seek(original, 0);
	return original;
}

static int
pgp_storage_save_begin(struct mail_save_context *ctx, struct istream *input)
{
	struct mailbox *box = ctx->transaction->box;
	struct pgp_storage_mailbox *mbox = PGP_STORAGE_CONTEXT(box);
	struct pgp_storage_user *puser =
		PGP_STORAGE_USER_CONTEXT(box->storage->user);
	struct istream *filtered;
	bool encrypted;
	int ret;

	/* ctx->saving marks a message entering the store: an IMAP APPEND, or an
	   LDA/LMTP delivery, which reaches us through mailbox_save_using_mail()
	   and therefore has copying_or_moving set as well. A plain copy or move
	   between folders leaves saving unset - that mail was already stored
	   under whatever policy applied at the time, so leave it alone. */
	if (puser == NULL || !puser->enabled || !ctx->saving)
		return mbox->module_ctx.super.save_begin(ctx, input);

	filtered = pgp_storage_run_filter(box, puser, input, &encrypted);

	if (!encrypted && puser->failure_mode != PGP_FAILURE_DELIVER) {
		/* Refuse the save rather than store readable mail. Nothing is
		   lost either way: a deferred sender retries, a rejected one
		   gets a bounce. */
		const char *reason =
			"Message could not be encrypted for storage";

		mail_storage_set_error(box->storage, MAIL_ERROR_TEMP, reason);
		e_error(box->storage->user->event,
			"pgp_storage: %s; refusing the save", reason);
		if (filtered != NULL)
			i_stream_unref(&filtered);
		return -1;
	}

	ret = mbox->module_ctx.super.save_begin(
		ctx, filtered != NULL ? filtered : input);
	if (filtered != NULL)
		i_stream_unref(&filtered);
	return ret;
}

static void pgp_storage_mailbox_allocated(struct mailbox *box)
{
	struct mailbox_vfuncs *v = box->vlast;
	struct pgp_storage_mailbox *mbox;

	mbox = p_new(box->pool, struct pgp_storage_mailbox, 1);
	mbox->module_ctx.super = *v;
	box->vlast = &mbox->module_ctx.super;

	v->save_begin = pgp_storage_save_begin;

	MODULE_CONTEXT_SET(box, pgp_storage_storage_module, mbox);
}

static void pgp_storage_mail_user_created(struct mail_user *user)
{
	struct mail_user_vfuncs *v = user->vlast;
	struct pgp_storage_user *puser;
	const char *value;

	puser = p_new(user->pool, struct pgp_storage_user, 1);
	puser->module_ctx.super = *v;
	user->vlast = &puser->module_ctx.super;

	value = mail_user_plugin_getenv(user, "pgp_storage_filter_bin");
	puser->bin_path = (value != NULL && *value != '\0') ?
		p_strdup(user->pool, value) : PGP_STORAGE_DEFAULT_BIN;

	value = mail_user_plugin_getenv(user, "pgp_storage_timeout");
	puser->timeout_msecs = PGP_STORAGE_DEFAULT_TIMEOUT_SECS * 1000;
	if (value != NULL && *value != '\0') {
		unsigned int secs;

		if (str_to_uint(value, &secs) == 0 && secs > 0)
			puser->timeout_msecs = secs * 1000;
		else {
			e_error(user->event, "pgp_storage: invalid "
				"pgp_storage_timeout '%s', using default", value);
		}
	}

	/* Arrives as a userdb field from mailcow's user_query; unknown userdb
	   fields land in the plugin namespace. Only the flag travels this way
	   -- an armored public key is multi-line and the auth protocol is
	   line based, so the filter looks the key up in SQL itself.

	   The query already folds in the domain's pgp_storage switch, so a
	   domain whose admin withdrew storage encryption reports the flag as
	   off here without any mailbox having been touched. */
	value = mail_user_plugin_getenv(user, "pgp_storage_encrypt");
	puser->enabled = value != NULL && *value == '1';

	value = mail_user_plugin_getenv(user, "pgp_failure_mode");
	if (value == NULL || *value == '\0' ||
	    strcmp(value, "deliver") == 0) {
		puser->failure_mode = PGP_FAILURE_DELIVER;
	} else if (strcmp(value, "defer") == 0) {
		puser->failure_mode = PGP_FAILURE_DEFER;
	} else {
		/* An unreadable value means someone asked for something other
		   than the default. Falling back to storing in the clear would
		   be exactly the silent downgrade this setting exists to
		   prevent, so hold the mail and make the error visible. */
		e_error(user->event, "pgp_storage: unknown pgp_failure_mode "
			"'%s'; deferring delivery until it is corrected",
			value);
		puser->failure_mode = PGP_FAILURE_DEFER;
	}

	if (puser->enabled) {
		e_debug(user->event, "pgp_storage: enabled for %s via %s",
			user->username, puser->bin_path);
	}

	MODULE_CONTEXT_SET(user, pgp_storage_user_module, puser);
}

static struct mail_storage_hooks pgp_storage_hooks = {
	.mail_user_created = pgp_storage_mail_user_created,
	.mailbox_allocated = pgp_storage_mailbox_allocated
};

void mail_pgp_storage_plugin_init(struct module *module)
{
	mail_storage_hooks_add(module, &pgp_storage_hooks);
}

void mail_pgp_storage_plugin_deinit(void)
{
	mail_storage_hooks_remove(&pgp_storage_hooks);
}
