# 3D Manager

Projeto open source para operacao local-first de uma farm de impressoras 3D. O repositorio concentra a aplicacao usada no dia a dia da operacao, um backend local com SQLite e um empacotamento desktop para Windows.

Hoje o sistema ja cobre mais do que um cadastro basico: ele ajuda a transformar custo de producao em preco de venda, organizar SKUs derivados de orcamentos, acompanhar estoque e controlar remessas em consignacao, mantendo banco e midias no proprio ambiente do usuario.

## O que o sistema faz hoje

### Precificacao e orcamento

Este e o nucleo atual do produto. O fluxo parte do cadastro mestre de impressoras, filamentos e custos fixos para montar orcamentos com breakdown de custo no backend.

O modulo permite:

- cadastrar e editar impressoras com consumo energetico e custo de aquisicao
- cadastrar e editar filamentos com recalculo automatico de custo por grama e por kg
- manter configuracoes vigentes de custos fixos, impostos e markup
- criar orcamentos com tempo de impressao, tempo de pos-processo, extras, embalagem e multiplos filamentos
- calcular custo de producao e preco final considerando energia, payback, mao de obra, imposto e markup
- anexar fotos, videos e arquivos `3mf` ao orcamento com persistencia local

### Catalogo comercial e estoque

Os orcamentos podem alimentar um cadastro de SKUs para venda. Isso permite sair do fluxo de "quanto custa produzir" e entrar no fluxo de "como esse item sera vendido e acompanhado".

Hoje o repositorio ja inclui:

- cadastro de SKUs com preco padrao e custo de producao
- derivacao de SKU a partir de orcamento
- sincronizacao de preco do SKU com o orcamento de origem
- controle de saldo por movimentacoes de estoque
- visao consolidada de estoque disponivel

### Pontos de venda e consignacao

O sistema tambem cobre um fluxo de distribuicao fisica para parceiros, lojas e revendedores.

Ja existe suporte para:

- cadastro de pontos de venda
- configuracao de comissao e periodicidade de contato
- criacao de lotes de consignacao com multiplos produtos
- registro de vendas e devolucoes por item enviado
- visao resumida do que esta em cada ponto de venda

### Integracao com marketplace

O backend ja possui integracao com Mercado Livre para uso local, com sincronizacao de catalogo e pedidos. Essa parte depende de credenciais configuradas em `backend/.env`.

## Arquitetura

- `mobile/`: app React Native com Expo. No desenvolvimento, ele pode rodar em modo web para acelerar o ciclo de iteracao.
- `backend/`: API local em Fastify com regras de negocio, calculos e persistencia em SQLite.
- `desktop/`: empacotamento Electron para distribuicao portable no Windows.
- `mockups/`: mockups de navegacao e estrutura de telas.
- `backend/migrations/`: migracoes versionadas do schema.
- `backend/storage/media/`: arquivos enviados localmente em ambiente de desenvolvimento.

## Persistencia local

O projeto segue a ideia de operar primeiro no dispositivo do usuario:

- banco local em SQLite
- migracoes aplicadas automaticamente ao subir o backend
- midias salvas em disco por entidade
- build desktop portable sem dependencia de banco central

Estrutura de midias dos orcamentos:

- `storage/media/quotes/<quote_id>/photos/<arquivo>`
- `storage/media/quotes/<quote_id>/videos/<arquivo>`
- `storage/media/quotes/<quote_id>/models/<arquivo>`

Se um arquivo com o mesmo nome ja existir no mesmo contexto, o backend retorna erro em vez de renomear automaticamente.

## Requisitos

- Node.js 20+
- npm 10+
- Windows para gerar o `.exe` portable
- Docker 24+ com Compose v2 para o fluxo de release em containers

## Como rodar em desenvolvimento

### Atalho pela raiz do projeto

Para o ciclo mais simples de desenvolvimento, use o iniciador da raiz. Ele sobe backend e frontend em paralelo e ja aponta o app para a API local correta.

Linux, macOS ou WSL:

```bash
./dev.sh
```

Para instalar dependencias antes de iniciar:

```bash
./dev.sh --install
```

Windows:

```powershell
.\dev.cmd
```

Ou com instalacao automatica das dependencias:

```powershell
.\dev.cmd -Install
```

Esse fluxo inicia:

- backend local em `http://localhost:3333`
- app Expo Web em outra janela/processo, usando `EXPO_PUBLIC_API_URL=http://localhost:3333`

### Subindo manualmente

Se preferir rodar cada parte separadamente:

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend web via Expo:

```bash
cd mobile
npm install
EXPO_PUBLIC_API_URL=http://localhost:3333 npm run web
```

Se estiver no PowerShell:

```powershell
cd mobile
npm install
$env:EXPO_PUBLIC_API_URL="http://localhost:3333"
npm run web
```

## Variaveis de ambiente

### Backend

O backend funciona sem configuracao extra para o fluxo principal de desenvolvimento. A integracao com Mercado Livre e opcional e depende de um arquivo `backend/.env`.

Exemplo:

```env
ML_APP_ID=your_mercadolivre_app_id
ML_CLIENT_SECRET=your_mercadolivre_client_secret
ML_REDIRECT_URI=http://localhost:3333/integrations/mercadolivre/callback
ML_MIN_REQUEST_INTERVAL_MS=450
ML_RATE_LIMIT_RETRY_MS=2000

PORT=3333
# DB_PATH=/absolute/path/to/backend/data.sqlite
# MEDIA_ROOT=/absolute/path/to/backend/storage/media
```

### Build web em Docker

O compose usa `EXPO_PUBLIC_API_URL=/api` por padrao para que o Nginx encaminhe as chamadas ao backend.

Arquivo de referencia: `.env.docker.example`.

## Rodando com Docker

O fluxo em Docker sobe uma composicao pronta para uso local com:

- `backend` em `http://localhost:3333`
- `web` em `http://localhost:8080`

Os dados persistem no volume `3d-manager-backend-data`, incluindo banco e midias.

Subir ambiente:

```bash
./scripts/docker-up.sh
```

Windows CMD:

```bat
scripts\docker-up.cmd
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/docker-up.ps1
```

Ver logs:

```bash
./scripts/docker-logs.sh
```

Ver logs de um servico especifico:

```bash
./scripts/docker-logs.sh backend
./scripts/docker-logs.sh web
```

Parar ambiente:

```bash
./scripts/docker-down.sh
```

Gerar build sem subir os containers:

```bash
./scripts/docker-build.sh
```

## Build desktop portable para Windows

O projeto pode ser distribuido como aplicacao desktop portable com backend e frontend empacotados.

Na raiz do projeto:

```powershell
scripts\build-exe-windows.cmd
```

ou:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-exe-windows.ps1
```

Saida esperada:

- executavel em `desktop/dist`

No modo portable, os dados de runtime ficam ao lado do executavel:

- `3d-manager-data/data/app.sqlite`
- `3d-manager-data/storage/media`

O banco `backend/data.sqlite` nao e empacotado como banco de uso real do app desktop. Um novo banco portable e criado na primeira execucao.

## Estrutura do repositorio

```text
.
|-- backend/
|   |-- migrations/
|   |-- src/
|   `-- README.md
|-- mobile/
|   |-- src/
|   |-- App.tsx
|   `-- README.md
|-- desktop/
|   |-- main.js
|   |-- backend-runner.cjs
|   `-- README.md
|-- mockups/
|-- scripts/
|-- dev.sh
|-- dev.ps1
|-- dev.cmd
`-- README.md
```

## Estado atual do produto

O projeto ja serve como base funcional para operacao local de precificacao, orcamento e expansao comercial de produtos impressos em 3D. Os proximos modulos naturais sao fila de impressao, monitoramento de producao, financeiro consolidado e sincronizacao multiusuario, mas o repositorio atual ja contem fluxos concretos de cadastro, calculo, estoque, consignacao e marketplace.

## Contribuindo

Contribuicoes sao bem-vindas. O melhor formato continua sendo PR pequeno, com contexto claro e um caminho simples de validacao.

Fluxo sugerido:

1. Abra uma issue descrevendo o problema ou a melhoria.
2. Crie um branch com escopo pequeno.
3. Envie um PR explicando o que mudou e como testar.
