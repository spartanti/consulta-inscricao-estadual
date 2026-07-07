#!/usr/bin/env bash
# Atualização MENSAL da base do SINTEGRA Brasil (rodar quando a Receita publicar).
#
#   MES=2026-07 bash atualizar-base.sh          # ciclo completo
#   MES=2026-07 PASSO=3 bash atualizar-base.sh  # retomar a partir de um passo
#
# Passos: 1) baixar ZIPs  2) índice SQLite  3) import (modo atualização)
#         4) radar  5) rankings  6) sócios
# Credencial: ~/.pg.env (PGPUB). Logs em ~/logs/atualizacao-<MES>.log
set -u

MES="${MES:?Informe MES=AAAA-MM (mês publicado pela Receita)}"
PASSO="${PASSO:-1}"
DIR="$HOME/receita-dados/$MES"
APP="$HOME/consulta-ie-es"
LOG="$HOME/logs/atualizacao-$MES.log"
mkdir -p "$HOME/logs"

source "$HOME/.pg.env"   # -> PGPUB
[ -n "${PGPUB:-}" ] || { echo "PGPUB não definido em ~/.pg.env"; exit 1; }

diz() { echo "[$(date '+%d/%m %H:%M')] $*" | tee -a "$LOG"; }
roda() { # roda um passo, aborta o ciclo se falhar
  local nome="$1"; shift
  diz ">>> $nome"
  if "$@" >> "$LOG" 2>&1; then diz "OK: $nome"; else diz "FALHOU: $nome — veja $LOG"; exit 1; fi
}

diz "===== Atualização da base — mês $MES (a partir do passo $PASSO) ====="

[ "$PASSO" -le 1 ] && roda "1/6 Download dos ZIPs" env MES="$MES" DEST="$DIR" bash "$APP/baixar-receita.sh"
[ "$PASSO" -le 2 ] && roda "2/6 Índice SQLite local" env LOCAL_DIR="$DIR" node "$APP/indexar-local.js"
[ "$PASSO" -le 3 ] && roda "3/6 Import (modo atualização)" env ATUALIZA=1 SKIP_INDEXES=1 DATABASE_URL="$PGPUB" LOCAL_DIR="$DIR" CHUNK=30000 node "$APP/importar-copy.js"
[ "$PASSO" -le 4 ] && roda "4/6 Radar de empresas novas" env DATABASE_URL="$PGPUB" LOCAL_DIR="$DIR" DIAS=90 node "$APP/radar-build.js"
[ "$PASSO" -le 5 ] && roda "5/6 Rankings" env DATABASE_URL="$PGPUB" LOCAL_DIR="$DIR" node "$APP/rankings-build.js"
[ "$PASSO" -le 6 ] && roda "6/6 Sócios" env DATABASE_URL="$PGPUB" LOCAL_DIR="$DIR" node "$APP/carregar-socios.js"

diz "===== CICLO CONCLUÍDO ($MES) ====="
diz "Dica: o mês anterior pode ser apagado para liberar disco: rm -rf ~/receita-dados/<mês-antigo>"
