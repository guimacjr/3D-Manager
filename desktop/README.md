# 3D Manager Desktop (Windows .exe Portable)

Empacotamento desktop via Electron.

## Gerar `.exe` portable

Na raiz do projeto:

1. `scripts\build-exe-windows.cmd`

ou

1. `powershell -ExecutionPolicy Bypass -File scripts/build-exe-windows.ps1`

## Resultado

- Executavel portable em: `desktop/dist`
- Usa release de: `release/windows`

## Dados locais (portable)

- O build nao carrega `backend/data.sqlite` (teste).
- O app cria e usa dados ao lado do `.exe`, em:
  - `3d-manager-data/data/app.sqlite`
  - `3d-manager-data/storage/media`
- Nao usa `%AppData%` para banco/midias.
