#!/usr/bin/env bash
# Pós-import: índices secundários + sócios + limpeza LGPD + ANALYZE.
set -u
source "$HOME/.pg.env"
PG="${PGPUB}?keepalives=1&keepalives_idle=30&keepalives_interval=10&keepalives_count=6"
APP="$HOME/consulta-ie-es"
diz() { echo "[$(date '+%d/%m %H:%M')] $*"; }

sql() { # roda um statement longo com até 3 tentativas
  local nome="$1" cmd="$2" t
  for t in 1 2 3; do
    diz ">>> $nome (tentativa $t)"
    if psql "$PG" -v ON_ERROR_STOP=1 -c "SET statement_timeout=0;" -c "$cmd"; then
      diz "OK: $nome"; return 0
    fi
    sleep 20
  done
  diz "FALHOU: $nome"; return 1
}

diz "===== PÓS-IMPORT ====="
sql "índice uf"        "CREATE INDEX IF NOT EXISTS idx_empresas_uf ON empresas(uf);"
sql "índice municipio" "CREATE INDEX IF NOT EXISTS idx_empresas_municipio ON empresas(municipio);"
sql "índice cnae"      "CREATE INDEX IF NOT EXISTS idx_empresas_cnae ON empresas(cnae_codigo);"
sql "índice updated"   "CREATE INDEX IF NOT EXISTS idx_empresas_updated ON empresas(updated_at DESC);"
sql "limpeza LGPD"     "DELETE FROM empresas WHERE cnpj IN (SELECT cnpj FROM cnpj_removidos);"
sql "analyze"          "ANALYZE empresas;"

diz ">>> carregando sócios (27,8M)"
if env DATABASE_URL="$PGPUB" LOCAL_DIR="$HOME/receita-dados/2026-06" node "$APP/carregar-socios.js"; then
  diz "OK: sócios"
else
  diz "FALHOU: sócios"
fi

diz "===== RESUMO ====="
psql "$PG" -c "SELECT relname, reltuples::bigint AS linhas, pg_size_pretty(pg_total_relation_size(oid)) AS tamanho FROM pg_class WHERE relname IN ('empresas','socios') ORDER BY relname;"
psql "$PG" -c "SELECT indexname FROM pg_indexes WHERE tablename='empresas' ORDER BY indexname;"
diz "===== PÓS-IMPORT CONCLUÍDO ====="
