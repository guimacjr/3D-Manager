# 3D Manager Backend (MVP)

Backend local para o modulo de precificacao/orcamento com SQLite.

## Stack
- Node.js + TypeScript
- Fastify
- SQLite (`better-sqlite3`)
- Migracoes SQL versionadas (`backend/migrations`)

## Subir backend
1. `cd backend`
2. `npm install`
3. `npm run dev`

Servidor padrao: `http://localhost:3333`

## Rotas principais
- `GET /health`
- `POST /uploads` (upload de `photo`, `video`, `3mf`)
- `GET /printers`
- `POST /printers`
- `PUT /printers/:id`
- `DELETE /printers/:id` (soft delete)
- `GET /filaments`
- `POST /filaments`
- `PUT /filaments/:id`
- `DELETE /filaments/:id` (soft delete)
- `GET /cost-settings`
- `GET /cost-settings/active`
- `POST /cost-settings`
- `GET /quotes`
- `GET /quotes/:id`
- `GET /quotes/:id/media`
- `POST /quotes`
- `PUT /quotes/:id`
- `DELETE /quotes/:id`

## Notas de calculo no POST /quotes
- Recebe `units_produced` (default 1)
- `filament_items` e `extra_costs` sao considerados como custos do lote informado no formulario.
- Persiste no `print_quotes` os valores **unitarios**:
  - `subtotal_cost_cents`
  - `tax_cost_cents`
  - `final_price_cents`
- Retorna tambem os valores de lote na resposta:
  - `subtotal_batch_cents`
  - `tax_batch_cents`
  - `final_batch_cents`

## Persistencia de midia local
- Midias (`photo`, `video`, `3mf`) enviadas no `POST /quotes` sao copiadas fisicamente para:
  - `backend/storage/media/quotes/<quote_id>/photos`
  - `backend/storage/media/quotes/<quote_id>/videos`
  - `backend/storage/media/quotes/<quote_id>/models`
- O upload em `POST /uploads` exige `quote_id` para identificar o dono dos arquivos.
- Os arquivos preservam o nome original (nao sao renomeados automaticamente).
- O banco salva em `print_quote_media.local_uri` o caminho interno (ex.: `storage/media/quotes/<quote_id>/models/arquivo.3mf`).
- Isso garante que os arquivos continuem disponiveis mesmo com o software fechado.
- Para listar midias de um orcamento: `GET /quotes/:id/media`

## Contrato minimo para criar orcamento
```json
{
  "print_name": "Suporte de Monitor",
  "description": "Peca para home office",
  "printer_id": "uuid",
  "cost_setting_id": "uuid",
  "units_produced": 10,
  "print_time_minutes": 320,
  "post_processing_minutes": 25,
  "packaging_cost_cents": 300,
  "filament_items": [
    { "filament_id": "uuid", "used_weight_grams": 160 }
  ],
  "extra_costs": [
    { "item_name": "Parafusos", "item_cost_cents": 250 }
  ],
  "media": [
    { "media_type": "3mf", "local_uri": "file:///modelo.3mf" }
  ]
}
```
