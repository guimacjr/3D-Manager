# 3D Manager Mobile

App React Native (Expo) para gestao da farm de impressoras 3D.

## Estado atual
- Bootstrap inicial do projeto.
- Mockups funcionais de navegacao como tela inicial (`App.tsx`).
- Schema SQL inicial do modulo de precificacao em `src/features/pricing/schema.sql`.

## Estrutura
- `App.tsx`: mockup navegavel das telas do MVP.
- `src/features/pricing/schema.sql`: tabelas iniciais SQLite.

## Rodar localmente
Este ambiente atual nao possui Node.js/Expo disponivel.
Para rodar em uma maquina com Node + Expo:

1. `cd mobile`
2. `npm install`
3. `npx expo start`

## Proximos passos
1. Instalar `expo-sqlite` e criar camada de acesso a dados.
2. Implementar migracoes versionadas.
3. Substituir dados mockados por dados reais do SQLite.
