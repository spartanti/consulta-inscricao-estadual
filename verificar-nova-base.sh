#!/usr/bin/env bash
# Verifica se a Receita publicou um mês novo dos Dados Abertos do CNPJ.
# Se sim: notificação na área de trabalho + marcador em ~/logs.
# Agendado via systemd user timer (diário). Rodar manualmente também funciona.
set -u

SHARE="${SHARE:-YggdBLfdninEJX9}"
BASE="https://arquivos.receitafederal.gov.br/public.php/dav/files/${SHARE}"
DADOS="$HOME/receita-dados"
LOGDIR="$HOME/logs"
mkdir -p "$LOGDIR"

# mês mais novo que já temos localmente
LOCAL=$(ls -1 "$DADOS" 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}$' | sort | tail -1)
[ -n "$LOCAL" ] || LOCAL="2026-06"

# candidatos: do mês seguinte ao local até o mês corrente
proximo() { date -d "${1}-01 +1 month" +%Y-%m; }
ATUAL=$(date +%Y-%m)
M=$(proximo "$LOCAL")
NOVO=""
while [ "$(date -d "${M}-01" +%s)" -le "$(date -d "${ATUAL}-01" +%s)" ]; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 20 -I "$BASE/$M/Cnaes.zip" || echo 000)
  if [ "$CODE" = "200" ]; then NOVO="$M"; fi
  M=$(proximo "$M")
done

if [ -n "$NOVO" ]; then
  MARCA="$LOGDIR/nova-base-$NOVO.flag"
  if [ ! -f "$MARCA" ]; then
    touch "$MARCA"
    echo "[$(date '+%d/%m %H:%M')] Receita publicou $NOVO (local: $LOCAL)" >> "$LOGDIR/verificador-base.log"
    notify-send -u critical "📊 SINTEGRA Brasil" "A Receita publicou a base $NOVO!\nRode: MES=$NOVO bash ~/consulta-ie-es/atualizar-base.sh" 2>/dev/null || true
  fi
  echo "NOVA BASE DISPONÍVEL: $NOVO (local: $LOCAL)"
else
  echo "Sem base nova (local: $LOCAL)."
fi
