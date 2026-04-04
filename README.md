# 3D Manager

Projeto open source para gerenciar uma farm de impressoras 3D com abordagem local-first.

Status atual: modulo de **precificacao e orcamento** em desenvolvimento ativo, com backend local, app React Native (Expo/Web) e build desktop portable para Windows.

## Objetivo

O foco do MVP e permitir:

- Cadastro de impressoras.
- Cadastro de filamentos.
- Configuracao de custos fixos.
- Criacao e gestao de orcamentos.
- Upload e download de midias relacionadas ao orcamento (`photo`, `video`, `3mf`).

## Arquitetura

- `mobile/`: app React Native (Expo + TypeScript).
- `backend/`: API local (Fastify + TypeScript + SQLite).
- `desktop/`: empacotamento desktop (Electron) para `.exe` portable no Windows.
- `mockups/`: mockups de navegacao/estrutura de telas.

Banco de dados:

- SQLite local.
- Migracoes versionadas em `backend/migrations`.

## Funcionalidades implementadas

- CRUD de impressoras (`soft delete`).
- CRUD de filamentos (`soft delete`, recalc de custo por grama/kg).
- Gestao de custos fixos com vigencia ativa.
- Orcamentos:
  - listar
  - criar
  - editar
  - visualizar detalhes
  - excluir
- Calculo de orcamento no backend (energia, payback, mao de obra, filamentos, extras, embalagem, imposto e markup).
- Midias por orcamento:
  - upload com `quote_id`
  - persistencia local por pasta do orcamento
  - download na tela de visualizacao

## Estrutura de midias

Arquivos sao salvos por orcamento, preservando nome original:

- `storage/media/quotes/<quote_id>/photos/<arquivo>`
- `storage/media/quotes/<quote_id>/videos/<arquivo>`
- `storage/media/quotes/<quote_id>/models/<arquivo>`

Observacao: se ja existir arquivo com mesmo nome no mesmo orcamento/tipo, o backend retorna erro (nao renomeia automaticamente).

## Requisitos

- Node.js 20+ (recomendado)
- npm 10+ (recomendado)
- Windows para build desktop `.exe` portable
- Docker 24+ com Docker Compose v2 (para release em containers)

## Release com Docker

Este release sobe:

- `backend` (Fastify + SQLite) em `http://localhost:3333`
- `web` (Expo exportado + Nginx) em `http://localhost:8080`

Persistencia:

- Volume Docker `3d-manager-backend-data` para banco e midias (`/data`)

### 1) Subir ambiente de release

Linux/macOS/WSL:

```bash
./scripts/docker-up.sh
```

Windows (CMD):

```bat
scripts\docker-up.cmd
```

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/docker-up.ps1
```

### 2) Ver logs

```bash
./scripts/docker-logs.sh
```

Ou somente um servico:

```bash
./scripts/docker-logs.sh backend
./scripts/docker-logs.sh web
```

### 3) Parar ambiente

```bash
./scripts/docker-down.sh
```

### 4) Build sem subir

```bash
./scripts/docker-build.sh
```

### 5) Configurar URL da API no build web (opcional)

Copie `.env.docker.example` para `.env` e ajuste `EXPO_PUBLIC_API_URL`.
Por padrao, o compose usa `/api` com proxy interno do Nginx para o backend.

## Rodando em desenvolvimento

Atalho para Windows (abre backend e frontend em duas janelas, com API correta):

```powershell
.\dev.cmd
```

Opcional (instala dependencias antes de abrir):

```powershell
.\dev.cmd -Install
```

## 1) Backend

```bash
cd backend
npm install
npm run dev
```

API padrao: `http://localhost:3333`

## 2) Mobile (Expo Web)

Em outro terminal:

```bash
cd mobile
npm install
npx expo start --web
```

Se quiser apontar para outra URL da API:

```bash
EXPO_PUBLIC_API_URL=http://localhost:3333 npx expo start --web
```

## API principal

- `GET /health`
- `POST /uploads`
- `GET /printers`
- `POST /printers`
- `PUT /printers/:id`
- `DELETE /printers/:id`
- `GET /filaments`
- `POST /filaments`
- `PUT /filaments/:id`
- `DELETE /filaments/:id`
- `GET /cost-settings`
- `GET /cost-settings/active`
- `POST /cost-settings`
- `GET /quotes`
- `GET /quotes/:id`
- `GET /quotes/:id/media`
- `POST /quotes`
- `PUT /quotes/:id`
- `DELETE /quotes/:id`
- `GET /sales/skus`
- `GET /sales/skus/:id`
- `GET /sales/skus/:id/media`
- `POST /sales/skus`
- `PUT /sales/skus/:id`
- `DELETE /sales/skus/:id`
- `GET /sales/points`
- `POST /sales/points`
- `PUT /sales/points/:id`
- `DELETE /sales/points/:id`
- `GET /sales/stock/overview`
- `POST /sales/stock/movements`
- `POST /sales/consignment/batches`
- `GET /sales/consignment/batches`
- `GET /sales/consignment/batches/:id`
- `POST /sales/consignment/batch-items/:id/sales`
- `POST /sales/consignment/batch-items/:id/returns`
- `GET /sales/points/overview`
- `GET /storage/media/*` (download de arquivo salvo)

## Build desktop portable (`.exe`) - Windows

Na raiz do projeto:

```powershell
scripts\build-exe-windows.cmd
```

ou:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-exe-windows.ps1
```

Saida esperada:

- executavel portable em `desktop/dist`

Comportamento portable:

- Nao usa `%AppData%` para banco/midias do sistema.
- Dados de runtime ficam ao lado do executavel em:
  - `3d-manager-data/data/app.sqlite`
  - `3d-manager-data/storage/media`

## Banco de teste vs producao

O pipeline de build desktop nao empacota o banco de teste `backend/data.sqlite`.
No modo portable, o banco de uso real e criado em `3d-manager-data/data/app.sqlite` na primeira execucao.

## Estrutura do repositorio

```text
.
|-- AGENTS.md
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
`-- scripts/
```

## Roadmap (alto nivel)

- Modulo de fila de impressao.
- Monitoramento de producao.
- Controle de estoque.
- Financeiro consolidado.
- Sincronizacao multiusuario opcional.

## Contribuindo

Contribuicoes sao bem-vindas.

Fluxo sugerido:

1. Abra uma issue descrevendo o problema/feature.
2. Crie um branch com escopo pequeno e objetivo.
3. Envie PR com:
   - contexto
   - o que mudou
   - como testar

