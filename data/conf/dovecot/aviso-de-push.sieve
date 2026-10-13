# Trecho a acrescentar ao fim de `global_sieve_after`.
#
# Está em arquivo separado por dois motivos: `global_sieve_after` pertence ao uid
# 82 (o vmail do contêiner) e não é editável pelo usuário comum, e o .gitignore
# que vem do mailcow ignora `data/conf/dovecot/global_sieve_*` — um arquivo com
# aquele nome não seria versionado e se perderia na próxima clonagem.
#
# Para aplicar:
#
#   sudo tee -a data/conf/dovecot/global_sieve_after \
#     < data/conf/dovecot/aviso-de-push.sieve
#   docker compose restart dovecot-mailcow
#
# ---------------------------------------------------------------- aviso de push
#
# Conta à plataforma que esta caixa recebeu algo, para ela disparar o push
# cifrado. O script não lê o corpo da mensagem: recebe o endereço por argumento e
# descarta a entrada padrão. Ver `sieve-pipe-bin/estelaz-avisa-push`.
#
# `:copy` não é opcional. Um `pipe` sem ele cancela o keep implícito, e a
# mensagem seria entregue ao script em vez de à caixa — ou seja, perdida. Com
# `:copy`, o script recebe uma cópia e a entrega segue normalmente.
#
# Vai no fim do `global_sieve_after` de propósito: depois do `duplicate` que já
# está lá, que deu `stop` nas repetições, e portanto nunca avisa duas vezes pela
# mesma mensagem. Spam não gera aviso — quem filtra para o Junk não quer ser
# acordado.
#
# Sem `ESTELAZ_PUSH_URL` no ambiente do contêiner o script sai calado, então
# deixar isto aqui numa instalação sem push não custa nada além da chamada.

require ["vnd.dovecot.pipe", "envelope", "variables"];

if allof (
  not header :contains "X-Spam-Flag" "YES",
  envelope :matches "to" "*"
  ) {
  pipe :copy "estelaz-avisa-push" [ "${1}" ];
}
