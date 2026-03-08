# AGENTS.md - 3D Manager

## 1) Visao Geral
Projeto para gerenciar uma farm de impressoras 3D com arquitetura local-first.
O primeiro modulo e o de precificacao e orcamento de producoes 3D.

Diretrizes:
- Frontend em React Native.
- Banco local no dispositivo no MVP.
- Futuro: sincronizacao opcional com banco centralizado para clientes pagantes.

## 2) Estado dos Modulos

Modulo 01 - Precificacao e Orcamento:
- Status: EM DESENVOLVIMENTO.
- Escopo atual: dados, regras de calculo, telas do fluxo de cadastro/orcamento, integracao mobile -> backend local e persistencia de midias.
- Estado funcional atual:
- Cadastro de impressoras: funcional (listar/criar/editar/excluir logico).
- Cadastro de filamentos: funcional (listar/criar/editar/excluir logico).
- Custos fixos: funcional (criar vigencia e ativar configuracao).
- Orcamentos: funcional (listar/criar/editar/excluir + visualizar detalhes + calculo com breakdown no backend).
- Upload de arquivos de orcamento: funcional para `photo`, `video` e `3mf` com persistencia local.
- Pendencia atual de UX/UI: consistencia visual do menu de navegacao no web (Chrome) ainda em ajuste.

Modulos futuros:
- Gestao de fila de impressao.
- Monitoramento de producao.
- Controle de estoque.
- Financeiro consolidado.
- Sincronizacao multiusuario.

## 3) Pontos de Contato Entre Modulos

Cadastro mestre -> Orcamento:
- Impressoras, filamentos e custos fixos alimentam o calculo.

Orcamento -> Producao:
- Orcamento aprovado pode virar ordem de producao.

Producao -> Financeiro:
- Consumo real e tempos reais retroalimentam indicadores de margem.

Sync futuro:
- Todas as entidades usam IDs estaveis (UUID em texto) e `updated_at`.

## 4) Escolha de Banco de Dados (MVP)
Banco escolhido: SQLite local.

Motivos:
- Compativel com React Native (`expo-sqlite` ou `react-native-sqlite-storage`).
- Offline por padrao.
- Bom encaixe para relacoes 1:N do modulo.
- Facilita migracoes versionadas.

## 5) Especificacao de Dados - Modulo de Orcamento

Convencoes:
- PK: `id TEXT` (UUID).
- Valores monetarios: `INTEGER` em centavos.
- Pesos: gramas.
- Tempo: minutos.
- Datas: `created_at` e `updated_at` em UTC (ISO-8601).

### 5.1 `printers`
- `id` TEXT PK
- `name` TEXT NOT NULL
- `model` TEXT NOT NULL
- `power_watts` INTEGER NOT NULL CHECK (`power_watts` > 0)
- `purchase_cost_cents` INTEGER NOT NULL CHECK (`purchase_cost_cents` >= 0)
- `is_active` INTEGER NOT NULL DEFAULT 1 CHECK (`is_active` IN (0,1))
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 5.2 `filaments`
- `id` TEXT PK
- `name` TEXT NOT NULL
- `brand` TEXT NOT NULL
- `color` TEXT NOT NULL
- `material_type` TEXT NOT NULL
- `purchase_link` TEXT
- `purchase_cost_cents` INTEGER NOT NULL CHECK (`purchase_cost_cents` >= 0)
- `purchased_weight_grams` INTEGER NOT NULL CHECK (`purchased_weight_grams` > 0)
- `cost_per_gram_cents` INTEGER NOT NULL
- `cost_per_kg_cents` INTEGER NOT NULL
- `is_active` INTEGER NOT NULL DEFAULT 1 CHECK (`is_active` IN (0,1))
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

Regra:
- `cost_per_gram_cents = purchase_cost_cents / purchased_weight_grams`.
- `cost_per_kg_cents = cost_per_gram_cents * 1000`.

### 5.3 `cost_settings`
Parametros globais vigentes para calculo:
- `id` TEXT PK
- `effective_from` TEXT NOT NULL
- `labor_hour_cost_cents` INTEGER NOT NULL CHECK (`labor_hour_cost_cents` >= 0)
- `energy_cost_kwh_cents` INTEGER NOT NULL CHECK (`energy_cost_kwh_cents` >= 0)
- `tax_rate_bps` INTEGER NOT NULL CHECK (`tax_rate_bps` >= 0)
- `printer_payback_months` INTEGER NOT NULL CHECK (`printer_payback_months` > 0)
- `markup_bps` INTEGER NOT NULL CHECK (`markup_bps` >= 0)
- `is_active` INTEGER NOT NULL DEFAULT 1 CHECK (`is_active` IN (0,1))
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 5.4 `print_quotes`
- `id` TEXT PK
- `print_name` TEXT NOT NULL
- `description` TEXT
- `printer_id` TEXT NOT NULL FK -> `printers(id)`
- `cost_setting_id` TEXT NOT NULL FK -> `cost_settings(id)`
- `print_time_minutes` INTEGER NOT NULL CHECK (`print_time_minutes` >= 0)
- `post_processing_minutes` INTEGER NOT NULL CHECK (`post_processing_minutes` >= 0)
- `packaging_cost_cents` INTEGER NOT NULL DEFAULT 0 CHECK (`packaging_cost_cents` >= 0)
- `subtotal_cost_cents` INTEGER NOT NULL DEFAULT 0
- `tax_cost_cents` INTEGER NOT NULL DEFAULT 0
- `final_price_cents` INTEGER NOT NULL DEFAULT 0
- `status` TEXT NOT NULL DEFAULT 'draft'
- `notes` TEXT
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

Valores permitidos em `status`:
- `draft`
- `quoted`
- `approved`
- `archived`

### 5.5 `print_quote_filaments`
- `id` TEXT PK
- `quote_id` TEXT NOT NULL FK -> `print_quotes(id)` ON DELETE CASCADE
- `filament_id` TEXT NOT NULL FK -> `filaments(id)`
- `used_weight_grams` INTEGER NOT NULL CHECK (`used_weight_grams` > 0)
- `unit_cost_per_gram_cents` INTEGER NOT NULL
- `line_total_cost_cents` INTEGER NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 5.6 `print_quote_extra_costs`
- `id` TEXT PK
- `quote_id` TEXT NOT NULL FK -> `print_quotes(id)` ON DELETE CASCADE
- `item_name` TEXT NOT NULL
- `item_cost_cents` INTEGER NOT NULL CHECK (`item_cost_cents` >= 0)
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 5.7 `print_quote_media`
Arquivos para anuncio e contexto comercial:
- `id` TEXT PK
- `quote_id` TEXT NOT NULL FK -> `print_quotes(id)` ON DELETE CASCADE
- `media_type` TEXT NOT NULL
- `local_uri` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

Valores permitidos em `media_type`:
- `photo`
- `video`

## 6) Formulas de Calculo

### 6.1 Custo por minuto da impressora (para lista de impressoras)
Baseado na regra solicitada:
- Considerar operacao de 20h por dia e 30 dias por mes.
- Minutos mensais de operacao = `20 * 30 * 60 = 36000`.

Formula:
- `energy_cost_per_minute_cents = (power_watts / 1000) * (energy_cost_kwh_cents / 60)`
- `payback_cost_per_minute_cents = purchase_cost_cents / (printer_payback_months * 36000)`
- `printer_usage_cost_per_minute_cents = energy_cost_per_minute_cents + payback_cost_per_minute_cents`

`energy_cost_kwh_cents` e `printer_payback_months` vem da configuracao ativa de `cost_settings`.

### 6.2 Calculo do orcamento
- Filamentos: `used_weight_grams * unit_cost_per_gram_cents`
- Energia da impressao: `((power_watts / 1000) * (print_time_minutes / 60)) * energy_cost_kwh_cents`
- Mao de obra: `((print_time_minutes + post_processing_minutes) / 60) * labor_hour_cost_cents`
- Subtotal: filamentos + extras + embalagem + energia + mao de obra + componente de payback
- Imposto: `subtotal * tax_rate_bps / 10000`
- Preco final: `(subtotal + imposto) * (1 + markup_bps / 10000)`

## 7) Especificacao de Telas (MVP)

### 7.1 Dashboard principal
Objetivo:
- Ponto de entrada para navegacao dos modulos do MVP.

Conteudo:
- Atalhos para:
- Cadastro de impressoras.
- Cadastro de filamentos.
- Custos fixos.
- Orcamentos.

### 7.2 Tela de impressoras
Lista das impressoras cadastradas mostrando:
- Nome da impressora.
- Modelo da impressora.
- Custo por minuto de uso.

Acoes:
- Botao "Cadastrar nova impressora".
- Botao "Editar" por item.

### 7.3 Tela de cadastro de impressora
Campos:
- Nome.
- Modelo.
- Custo da impressora.
- Consumo de energia (W).

Acoes:
- Salvar.
- Cancelar.

### 7.4 Tela de filamentos
Lista dos filamentos cadastrados mostrando:
- Nome.
- Marca.
- Link de compra.
- Cor.
- Tipo (PLA, PETG, ASA etc).
- Preco por kg.
- Preco por grama.

Acoes:
- Botao "Novo filamento".
- Botao "Editar" por item.

### 7.5 Tela de cadastro de filamento
Campos:
- Nome.
- Marca.
- Quantidade comprada (g ou kg convertido para g).
- Valor pago.
- Cor.
- Tipo de material.
- Link de compra.

Acoes:
- Salvar.
- Cancelar.

### 7.6 Tela de custos fixos
Lista simples dos parametros atuais:
- Custo de hora/homem.
- Custo de energia por kWh.
- Aliquota de imposto.
- Prazo de payback das impressoras.
- Markup.

Acoes:
- Editar configuracao ativa.
- Criar nova vigencia.

### 7.7 Tela de orcamentos
Lista de orcamentos criados com:
- Nome do item orcado.
- Tempo de impressao.
- Tempo de pos-producao.
- Custo de producao.
- Preco de venda estimado.

Acoes:
- Botao "Novo orcamento".
- Botao "Editar" por item.
- Botao "Ver detalhes" por item.

### 7.8 Tela de novo orcamento
Campos:
- Nome do objeto.
- Upload de fotos.
- Upload de videos.
- Descricao.
- Lista de filamentos e quantidade utilizada.
- Tempo de impressao.
- Tempo de pos-producao.
- Lista de itens extras com custo.
- Custo de embalagem.

Acoes:
- Salvar rascunho.
- Calcular preco.
- Finalizar orcamento.

## 8) Convencoes de Implementacao
- Toda mudanca de schema deve ter migracao versionada.
- Manter snapshot dos custos no momento do orcamento.
- Preferir soft delete (`is_active`) para cadastros mestres.
- Em telas de lista, mostrar valores monetarios formatados.

## 9) Mockups
Mockups iniciais em React Native:
- `mockups/MockupApp.tsx`
- `mockups/README.md`

Esses mockups sao de navegacao e estrutura de campos, sem integracao real com banco.

## 10) Implementacao atual no repositorio
- App mobile em `mobile/` (Expo + TypeScript), com fluxo navegavel e formularios conectados ao backend local via `EXPO_PUBLIC_API_URL`.
- Backend local em `backend/` (Fastify + TypeScript + SQLite `better-sqlite3`) com migracoes versionadas em `backend/migrations`.
- Banco local do backend: `backend/data.sqlite`.
- Schema do modulo no mobile: `mobile/src/features/pricing/schema.sql`.
- Calculo de orcamento centralizado no backend em `backend/src/pricing.ts`.
- Persistencia de arquivos de midia em `backend/storage/media/*` e metadados em `print_quote_media`.
- Mockup alternativo de navegacao mantido em `mockups/MockupApp.tsx`.

## 11) Funcoes Implementadas Atualmente

### 11.1 API backend disponivel
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

### 11.2 Regras e comportamento implementados
- Soft delete para entidades mestre (`printers`, `filaments`) via `is_active`.
- Recalculo automatico de `cost_per_gram_cents` e `cost_per_kg_cents` em filamentos.
- Custo de orcamento calculado no backend com:
- energia da impressao
- payback da impressora
- mao de obra
- filamentos
- extras
- embalagem
- imposto
- markup
- Persistencia de valores unitarios no `print_quotes` e retorno adicional de valores de lote nas respostas da API.
- Persistencia local de midias (`photo`, `video`, `3mf`) ao criar/editar orcamentos.

### 11.3 Fluxos de tela implementados no mobile
- Dashboard com atalhos para todos os fluxos do modulo.
- CRUD de impressoras.
- CRUD de filamentos.
- Gestao de custos fixos com criacao de nova vigencia.
- Lista de orcamentos com editar, visualizar e excluir.
- Formulario de orcamento com:
- upload de midias
- lista de filamentos usados
- lista de itens extras
- tempos de impressao e pos-producao
- custo de embalagem
