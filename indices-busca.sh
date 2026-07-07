#!/usr/bin/env bash
# Índices que servem a busca reescrita (prefixo/igualdade) na tabela de 72GB.
set -u
source "$HOME/.pg.env"
PG="${PGPUB}?keepalives=1&keepalives_idle=30&keepalives_interval=10&keepalives_count=6"
diz() { echo "[$(date '+%d/%m %H:%M')] $*"; }
sql() {
  local nome="$1" cmd="$2" t
  for t in 1 2 3; do
    diz ">>> $nome (tentativa $t)"
    if psql "$PG" -v ON_ERROR_STOP=1 -c "SET statement_timeout=0;" -c "$cmd"; then diz "OK: $nome"; return 0; fi
    sleep 20
  done
  diz "FALHOU: $nome"; return 1
}

sql "municipio pattern"  "CREATE INDEX IF NOT EXISTS idx_empresas_mun_pat ON empresas (municipio varchar_pattern_ops);"
sql "cnae pattern"       "CREATE INDEX IF NOT EXISTS idx_empresas_cnae_pat ON empresas (cnae_codigo varchar_pattern_ops);"
sql "razao pattern"      "CREATE INDEX IF NOT EXISTS idx_empresas_razao_pat ON empresas (razao_social varchar_pattern_ops);"
sql "uf+municipio (mapa)" "CREATE INDEX IF NOT EXISTS idx_empresas_uf_mun ON empresas (uf, municipio);"
sql "drop municipio antigo (redundante)" "DROP INDEX IF EXISTS idx_empresas_municipio;"
sql "analyze" "ANALYZE empresas;"
diz "===== ÍNDICES DE BUSCA CONCLUÍDOS ====="
psql "$PG" -c "SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) FROM pg_indexes WHERE tablename='empresas' ORDER BY indexname;"
