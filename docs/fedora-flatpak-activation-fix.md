# Fedora: Vesktop aberto, mas ativação encerrava o cliente

Os logs fornecidos pela instalação local mostraram duas ativações na GUI 2.0.9 em 24/09/2026. O Vesktop 1.6.7 iniciou; a GUI continuou aguardando a confirmação do PID no namespace e, no vencimento, executou `Fechando o Discord`. A mensagem de falha de inicialização não prova um crash do compartilhamento de tela.

O journal e a reprodução com Flatpak 1.18.2 confirmaram duas instâncias com o mesmo ID `dev.vencord.Vesktop`. O Zypak cria uma instância auxiliar para o zygote em outro namespace de rede. `flatpak ps --columns=child-pid,application` pode listar essa instância primeiro. O código antigo retornava a primeira linha, ignorando o cliente correto.

A seleção agora percorre os PIDs positivos do app exato e prefere aquele cuja rede corresponde ao namespace esperado. Sem correspondência, a ativação continua recusada; nenhuma prova de isolamento foi removida. A correção também é usada pela consulta de status. O fallback para `pid` continua disponível para Flatpak antigo sem `child-pid`.

Na reprodução local, um namespace sem rede criado com `unshare` continha a instância principal; a instância auxiliar tinha um inode diferente. A função corrigida encontrou o PID principal usando o inode esperado como referência. As instâncias abertas para diagnóstico foram encerradas. Não foram usadas credenciais administrativas, não foi criada uma interface WireGuard nem alterada a rota do host. Isso valida o reconhecimento do processo, mas não comprova a chamada ou a captura de tela real pelo túnel.

O log de captura também contém avisos Wayland/Vulkan e X11. Não foram tratados como causa confirmada do fechamento: a sequência documentada mostra o encerramento pelo rollback da ativação. Caso a seleção de tela ainda falhe depois de a GUI indicar ativação concluída, será necessário investigar a captura separadamente.

## Build de teste

A sessão local registrou a abertura de 2.0.6 seguida de 2.0.9, e as imagens mostram o visual oficial. Para impedir que a atualização remota substitua as mudanças locais, `npm run build:local` empacota uma marca explícita `goliveLocalBuild: true`. Nesse artefato, o updater não é criado; preferências e funcionamento das distribuições oficiais não são alterados. A versão mostrada inclui `local`.

O link Discord no canto inferior direito foi removido.

### Botão bloqueado depois da medição (25/09)

A GUI deixava `protonOptimizationInFlight` ativo depois de terminar a medição. Por isso mostrava a rota selecionada e “Ativar Bypass”, mas mantinha o botão desabilitado. O encerramento agora limpa esse estado antes de atualizar a disponibilidade dos controles, preservando bloqueios reais como Discord ausente.

O smoke test Electron reproduziu a falha no pacote anterior e passou com a correção. Ele usa o renderer real com IPC simulado e cobre sucesso, cancelamento, falha retornada, exceção, medição adiada e Discord ausente; nos cinco primeiros casos confirmou que clicar chama a ativação. Isso não inicia um túnel nem valida a transmissão real.

Para testar, escolha **Sair** no ícone da versão antiga na bandeja — fechar a janela apenas a esconde — e execute `golive-gui/dist-app/local/GoLiveBypass-local.AppImage`. O EXE correspondente é `GoLiveBypass-local.exe`; nenhum dos dois foi publicado.

## Verificações

- Regressões de múltiplas instâncias Zypak, ordem da tabela, PID zero, ID parecido, cliente fora do namespace e Flatpak antigo.
- Testes de ativação Linux, elevação, status/saúde e canais/updater.
- Teste do bloqueio do updater local, inclusive com atualização automática habilitada.
- `bash -n`, `check-bypass`, compilação e smoke test Electron do pacote: ausência do botão, marca local, temas, configurações e logs.
- Logs de teste e capturas em `dist-app/local/review/`; hashes dos artefatos em `dist-app/local/SHA256SUMS`.

A GUI usa o motor shell compartilhado. O plugin Linux tem controlador independente e não usa essa seleção; Windows não usa namespaces Flatpak. O standalone público permanece pausado.

## Mensagens recusadas com a mídia funcionando (25/09)

O usuário confirmou câmera e compartilhamento funcionando, mas leitura de mensagens em DMs e servidores falhando apenas com o túnel ativo. A requisição de mensagens retornou HTTP 403 com `{"message":"internal network error","code":40333}`. A última rota selecionada registrada era MX-FREE#7.

Consultas sem credenciais ao gateway e a `/users/@me`, tanto na rede normal quanto dentro do namespace, retornaram respectivamente 200 e o 401 esperado. Isso comprova conectividade básica, não o acesso autenticado às mensagens. Os logs do cliente não continham o status das requisições; o código veio da aba Network informada pelo usuário.

Há uma reprodução desse código como bloqueio Cloudflare na [issue 6473 do repositório de documentação do Discord](https://github.com/discord/discord-api-docs/issues/6473). O código não identifica sozinho a regra responsável. Após a comparação solicitada, o usuário confirmou que a leitura voltou a funcionar ao trocar de servidor. Isso associa o problema à saída anterior, sem provar qual regra de proteção foi aplicada. Não foi adicionada troca automática, alteração de cabeçalhos ou manipulação de credenciais.

## Revisão de estabilidade (25/09)

Os novos artefatos ficam em `golive-gui/dist-app/stability/`, separados da versão aberta pelo usuário. A GUI agora ignora respostas de status ultrapassadas, impede novas ativações durante uma operação pendente e libera a tentativa seguinte após falha. Configurações contém “Sair do GoLiveBypass”, ligado ao mesmo encerramento com restauração usado pela bandeja.

Validação: 564 testes em 66 arquivos da GUI, compilação e smoke test Electron com operações simuladas. O smoke cobre também início com rota manual, clique duplicado durante atualização de status, resposta atrasada, falha de ativação e saída sem bandeja. A rota manual não dispara otimização automática ao abrir. Não foi iniciada uma chamada nova nem executado o EXE no Windows nesta revisão.
