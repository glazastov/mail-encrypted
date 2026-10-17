local CAMINHO = "/hooks/push/entrega"
local PRAZO_PADRAO_EM_MS = 2000

local function ajuste(nome)
  local valor = os.getenv(nome)

  if valor == nil then
    return ""
  end

  return (valor:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function prazo_em_ms()
  local bruto = ajuste("ESTELAZ_PUSH_TIMEOUT")

  if bruto == "" then
    return PRAZO_PADRAO_EM_MS
  end

  local segundos = tonumber(bruto)

  if segundos == nil or segundos <= 0 then
    return PRAZO_PADRAO_EM_MS
  end

  return math.floor(segundos * 1000)
end

local function texto_json(valor)
  local escapado = valor:gsub('[\\"]', "\\%0"):gsub("%c", function(bruto)
    return string.format("\\u%04x", bruto:byte())
  end)

  return '"' .. escapado .. '"'
end

local function corpo_json(endereco, pasta)
  if pasta == nil or pasta == "" then
    return "{" .. texto_json("address") .. ":" .. texto_json(endereco) .. "}"
  end

  return "{"
    .. texto_json("address") .. ":" .. texto_json(endereco) .. ","
    .. texto_json("folder") .. ":" .. texto_json(pasta)
    .. "}"
end

local function envia(url, token, endereco, pasta)
  local cliente = dovecot.http.client({
    request_timeout_msecs = prazo_em_ms(),
    max_attempts = 1,
  })

  local pedido = cliente:request({
    url = url:gsub("/+$", "") .. CAMINHO,
    method = "POST",
  })

  pedido:add_header("Content-Type", "application/json")
  pedido:add_header("Authorization", "Bearer " .. token)
  pedido:set_payload(corpo_json(endereco, pasta))

  local status = pedido:submit():status()

  if status >= 300 then
    dovecot.i_warning(string.format("estelaz-push: a plataforma respondeu %d", status))
  end
end

function dovecot_lua_notify_begin_txn(user)
  return {
    endereco = (user.username or ""):lower(),
    avisar = false,
    pasta = nil,
  }
end

function dovecot_lua_notify_event_message_new(ctx, event)
  if event.mailbox ~= "INBOX" then
    return
  end

  ctx.avisar = true
  ctx.pasta = event.mailbox
end

function dovecot_lua_notify_end_txn(ctx)
  if not ctx.avisar then
    return
  end

  local url = ajuste("ESTELAZ_PUSH_URL")
  local token = ajuste("ESTELAZ_PUSH_TOKEN")

  if url == "" or token == "" then
    return
  end

  if ctx.endereco == "" or not ctx.endereco:find("@", 1, true) then
    dovecot.i_warning("estelaz-push: sem endereço utilizável; nada enviado")
    return
  end

  local ok, erro = pcall(envia, url, token, ctx.endereco, ctx.pasta)

  if not ok then
    dovecot.i_warning(string.format("estelaz-push: não deu para avisar: %s", tostring(erro)))
  end
end
