# Revisão local — 24/09/2026

Build local da GUI 2.0.6, baseado em `3a7eeed` mais as alterações desta revisão. Não é uma nova release oficial; não houve publicação, envio de relatos ou anúncios.

## Escopo e correções

A revisão manual se concentrou na GUI Electron, na fronteira entre página e processo principal, na renderização de dados externos e nas dependências de distribuição. A busca estática também percorreu o repositório atrás de padrões de mineradores, coleta de credenciais, desativação de antivírus, execução dinâmica e downloads de scripts. Ocorrências de PowerShell codificado e base64 foram encontradas em instaladores/helpers e testes; essas ocorrências por si só não demonstram malware.

Problemas concretos corrigidos:

| Antes | Depois |
| --- | --- |
| Página com Node.js habilitado e sem isolamento | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, preload CommonJS e `contextBridge` |
| IPC sem validação central da origem | Só aceita a janela registrada, seu frame principal e o documento esperado; CAPTCHA mantém a validação própria |
| Navegação principal sem bloqueio explícito | Navegação, redirects e webviews bloqueados; links externos limitados a HTTPS em GitHub, Discord e conta Proton |
| Falta de CSP e fonte remota | CSP local, fontes do sistema, sem conexões do renderer em produção; requisições funcionais continuam no backend |
| URL da API interpolada em `innerHTML` | Elemento criado via DOM, texto separado e URL GitHub validada |
| Biblioteca de animação usada por um ícone | Animação CSS, sem GSAP; redução de aproximadamente 54% no JS principal (130,34 → 59,91 kB, antes de gzip) |
| Cada trecho de log reescrevia a área e forçava scroll | Atualização agrupada por frame, buffer limitado e preservação do scroll durante a leitura |

O isolamento segue as [orientações de segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security). Permissões da página permanecem negadas; a cópia do diagnóstico usa um comando específico no processo principal, sem liberar leitura da área de transferência à página.

## Validação

- GUI: 557 testes em 64 arquivos aprovados; compilação TypeScript/Vite e helpers Linux/Windows concluída.
- Website: 8 testes aprovados e geração estática concluída após atualizar o Vitest.
- Helper Proton e API: `go test ./...` aprovado nos dois módulos.
- `npm audit`: zero alertas no lockfile final da GUI e do website, incluindo dependências de desenvolvimento.
- `govulncheck`: nenhuma vulnerabilidade alcançável detectada na API ou no helper. Após atualizar `x/crypto`, resta um aviso em nível de módulo sobre o pacote legado `golang.org/x/crypto/openpgp` (GO-2026-5932), que não é importado pelo helper; não existe correção indicada para esse pacote. Isso não foi ocultado nem tratado como uma vulnerabilidade exercitada pelo aplicativo.
- Smoke test com Electron real, sandbox habilitada e backend simulado: preload, IPC, temas, configurações, painel de arquivo, CSP, logs, copiar diagnóstico e layout compacto. Nenhuma requisição HTTP do renderer nesse teste.
- Teste visual no Fedora 44, renderização de teste via X11/offscreen, sem executar o controlador de VPN nem usar credenciais reais. Capturas em `golive-gui/dist-app/review/`.
- ClamAV local 1.5.4, base daily 28133 (24/09/2026): 23.474 arquivos de fontes e dependências examinados, sem detecções. Os arquivos não foram enviados a serviços de análise externos.
- Artefatos: o AppImage e os demais componentes passaram na varredura. O EXE portable e o executável interno Windows atingiram inicialmente `Heuristics.Limits.Exceeded.MaxScanTime`; o resumo do ClamAV contabiliza esses limites como detecções, mas não identifica uma família de malware. A repetição do EXE portable com limite de 600 segundos terminou sem detecções (244 segundos de análise). A repetição do executável interno Windows também terminou sem detecções. Logs originais e das repetições preservados em `review/`.
- O conteúdo da aplicação extraído do AppImage e do EXE corresponde ao código compilado validado; hashes dos helpers conferidos com o manifesto. O runtime do AppImage respondeu ao comando de ajuda e a extração concluiu no Fedora.

## Artefatos e reprodução

Os executáveis ficam em `golive-gui/dist-app/`, com `SHA256SUMS` para conferir os bytes entregues. `review/` contém evidências. O EXE é portable x64 e não tem assinatura de um certificado de distribuição do projeto.

No Fedora, a partir da raiz do repositório:

```sh
cd golive-gui/dist-app
sha256sum -c SHA256SUMS
chmod +x GoLiveBypass-2.0.6.AppImage
./GoLiveBypass-2.0.6.AppImage
```

Se o sistema informar que não consegue montar a imagem por falta de FUSE, extraia e execute sem desabilitar a sandbox do Electron:

```sh
./GoLiveBypass-2.0.6.AppImage --appimage-extract
./squashfs-root/AppRun
```

Para reproduzir a compilação, instale Node.js compatível com Vite 8 e Go 1.26.8 ou posterior, rode `npm ci` em `golive-gui/`, depois `npm run compile` e `npx electron-builder --linux AppImage --win portable --x64 --publish never`. A validação visual usa `npx electron --ozone-platform=x11 scripts/ui-smoke.cjs` após compilar; o script só usa um backend simulado e um perfil temporário.

## Limites reais

Nenhum scanner, auditoria de dependências ou revisão pontual garante que um aplicativo seja totalmente seguro. O resultado significa que as verificações descritas não identificaram malware e que falhas concretas foram corrigidas. Não é certificação de segurança.

Não foi realizado teste funcional de túnel/isolamento de rede no Fedora, nem execução do EXE em Windows. Login Proton/CAPTCHA real, drivers, provedores externos, atualizações futuras e todas as combinações de plugins/clientes não foram validados ponta a ponta. A auditoria manual não cobriu exaustivamente cada linha de instaladores, plugin e standalone; downloads e execução de scripts de terceiros nesses caminhos continuam sendo pontos de confiança externa. A GUI continua exigindo privilégios administrativos nas operações de rede já existentes.
