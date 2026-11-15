# GoTransfer — modelo visual (PWA)

Modelo mínimo, só para ver o ícone, a tela de abertura e a tela inicial no celular. Não tem funcionalidades.

## Instalar no Android

O Android só instala um PWA como app de verdade quando ele é aberto por um endereço **https**.

1. Acesse https://app.netlify.com/drop no computador e arraste o arquivo `apps/gotransfer-pwa-site.zip` (ou os arquivos desta pasta, exceto `serve.mjs`).
2. O Netlify gera um endereço `https://….netlify.app`. Abra esse endereço no **Chrome do celular**.
3. Toque em **Instalar o app** (ou menu ⋮ › **Instalar app**). O ícone GoTransfer aparece na tela inicial.

Para gerar um arquivo `.apk` depois, use o endereço https em https://www.pwabuilder.com (opção Android).

## Testar no computador

```bash
node apps/pwa-preview/serve.mjs
```

Abra http://localhost:5173. Pela rede local (`http://IP-do-computador:5173`), o celular abre a página, mas sem https o Chrome só cria um atalho e não instala como app.

## Arquivos

- `index.html`, `styles.css`, `app.js`: abertura e tela inicial
- `manifest.webmanifest`: nome, cores e ícones do app
- `sw.js`: permite abrir offline e instalar
- `icons/`: ícones gerados a partir de `assets/brand/gotransfer-logo.png`
