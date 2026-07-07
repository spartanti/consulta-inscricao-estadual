#!/usr/bin/env bash
# Baixa os Dados Abertos do CNPJ (Receita Federal) com VALIDAÇÃO e RETOMADA.
# Cada arquivo é conferido (unzip -l) após baixar; se vier truncado, retoma/retenta.
# Arquivos já íntegros são pulados. Pode rodar várias vezes com segurança.
#
#   bash baixar-receita.sh                 # baixa tudo (Brasil)
#   MODO=amostra bash baixar-receita.sh    # só o necessário p/ validar
#   MAX_TENTATIVAS=10 bash baixar-receita.sh

MES="${MES:-2026-06}"
# A RFB migrou os dados para um compartilhamento Nextcloud (WebDAV público).
SHARE="${SHARE:-YggdBLfdninEJX9}"
BASE="https://arquivos.receitafederal.gov.br/public.php/dav/files/${SHARE}/${MES}"
DEST="${DEST:-$HOME/receita-dados/${MES}}"
MODO="${MODO:-completo}"
MAX_TENTATIVAS="${MAX_TENTATIVAS:-8}"

mkdir -p "$DEST"; cd "$DEST"
echo "Origem:  $BASE"
echo "Destino: $DEST"
echo "Modo:    $MODO | máx. tentativas por arquivo: $MAX_TENTATIVAS"
echo

valido() { unzip -l "$1" >/dev/null 2>&1; }

baixar() {
  local f="$1" tentativa=0
  if [ -f "$f" ] && valido "$f"; then
    echo "✓ já íntegro: $f ($(du -h "$f" | cut -f1))"
    return 0
  fi
  while :; do
    tentativa=$((tentativa+1))
    if [ "$tentativa" -gt "$MAX_TENTATIVAS" ]; then
      echo "✗ FALHOU após $MAX_TENTATIVAS tentativas: $f"
      return 1
    fi
    echo ">> $f (tentativa $tentativa)"
    # -c retoma de onde parou; timeouts e retries para conexões que caem
    wget -c --tries=3 --timeout=120 --read-timeout=120 --retry-connrefused \
         --progress=dot:giga "$BASE/$f" -O "$f" || true
    if valido "$f"; then
      echo "✓ OK: $f ($(du -h "$f" | cut -f1))"
      return 0
    fi
    # Se não validou e o arquivo está estranhamente pequeno, recomeça do zero.
    local sz; sz=$(stat -c%s "$f" 2>/dev/null || echo 0)
    if [ "$sz" -lt 1000 ]; then
      echo "   arquivo muito pequeno ($sz B), recomeçando do zero..."
      rm -f "$f"
    else
      echo "   incompleto ($((sz/1024/1024)) MB), retomando..."
    fi
  done
}

FALHAS=0
# Tabelas de apoio (pequenas) + as necessárias para o import completo
for f in Municipios.zip Cnaes.zip Qualificacoes.zip Naturezas.zip Motivos.zip Paises.zip Simples.zip; do
  baixar "$f" || FALHAS=$((FALHAS+1))
done

if [ "$MODO" = "amostra" ]; then
  baixar "Empresas0.zip" || FALHAS=$((FALHAS+1))
  baixar "Estabelecimentos0.zip" || FALHAS=$((FALHAS+1))
else
  for k in 0 1 2 3 4 5 6 7 8 9; do baixar "Empresas${k}.zip" || FALHAS=$((FALHAS+1)); done
  for k in 0 1 2 3 4 5 6 7 8 9; do baixar "Estabelecimentos${k}.zip" || FALHAS=$((FALHAS+1)); done
  for k in 0 1 2 3 4 5 6 7 8 9; do baixar "Socios${k}.zip" || FALHAS=$((FALHAS+1)); done
fi

echo
echo "===================== RESUMO ====================="
for f in "$DEST"/*.zip; do
  [ -e "$f" ] || continue
  if valido "$f"; then echo "  OK       $(basename "$f")  ($(du -h "$f" | cut -f1))"
  else echo "  TRUNCADO $(basename "$f")"; fi
done
echo "=================================================="
if [ "$FALHAS" -gt 0 ]; then
  echo "⚠ $FALHAS arquivo(s) não baixaram íntegros. Rode o script de novo para retomar."
else
  echo "✓ Tudo íntegro em: $DEST"
fi
echo ">> Pasta para informar ao assistente: $DEST"
