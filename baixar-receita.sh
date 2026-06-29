#!/usr/bin/env bash
# Baixa os Dados Abertos do CNPJ (Receita Federal) para uma pasta local.
# Rode no SEU terminal (sua rede). Depois informe a pasta ao assistente.
#
#   bash baixar-receita.sh            # baixa tudo (Brasil) ~5 GB
#   MODO=amostra bash baixar-receita.sh   # baixa só o necessário p/ validar (~1 GB)
set -e

MES="${MES:-2026-06}"
# A RFB migrou os dados abertos para um compartilhamento Nextcloud (WebDAV publico).
# O antigo caminho /dados/cnpj/dados_abertos_cnpj/ nao existe mais (retorna 404).
SHARE="${SHARE:-YggdBLfdninEJX9}"
BASE="https://arquivos.receitafederal.gov.br/public.php/dav/files/${SHARE}/${MES}"
DEST="${DEST:-$HOME/receita-dados/${MES}}"
MODO="${MODO:-completo}"

mkdir -p "$DEST"
cd "$DEST"
echo "Baixando de: $BASE"
echo "Destino:     $DEST"
echo "Modo:        $MODO"
echo

baixar() {
  echo ">> $1"
  # -c retoma download interrompido; --tries para resiliência
  wget -c --tries=5 --read-timeout=60 "$BASE/$1" -O "$1" || curl -fL -C - "$BASE/$1" -o "$1"
}

# Tabelas de apoio (pequenas)
baixar "Municipios.zip"
baixar "Cnaes.zip"

if [ "$MODO" = "amostra" ]; then
  baixar "Empresas0.zip"
  baixar "Estabelecimentos0.zip"
else
  for k in 0 1 2 3 4 5 6 7 8 9; do baixar "Empresas${k}.zip"; done
  for k in 0 1 2 3 4 5 6 7 8 9; do baixar "Estabelecimentos${k}.zip"; done
fi

echo
echo "OK. Arquivos em: $DEST"
ls -lh "$DEST"
echo
echo ">> Agora informe ao assistente o caminho:  $DEST"
