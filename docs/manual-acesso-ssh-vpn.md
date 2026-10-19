# Manual de Acesso SSH ao Servidor 172.21.3.182 (porta 22022)

**DTI – Prefeitura Municipal de Franca**
**Acesso remoto via VPN WatchGuard + SSH com autenticação do AD**


| Item                                        | Informação                                             |
| ------------------------------------------- | ------------------------------------------------------ |
| Responsável DTI (fornece o arquivo `.ovpn`) | **Ricardo David – Administrador**                      |
| Público                                     | Administradores e programadores autorizados            |
| Sistemas cobertos                           | Windows (PuTTY e VS Code) e Linux (terminal e VS Code) |


---

## 1. Legenda de siglas

- **VPN** (Virtual Private Network, Rede Privada Virtual): túnel seguro até a rede interna.
- **SSH** (Secure Shell): protocolo de acesso remoto seguro por terminal.
- **AD** (Active Directory): serviço da Microsoft que centraliza usuários e senhas.
- **DTI** (Departamento de Tecnologia da Informação).
- **IP** (Internet Protocol): endereço do equipamento na rede.
- **UPN** (User Principal Name): formato de login `usuario@dominio`.
- **NetBIOS**: formato de login `DOMINIO\usuario`.

---



## 2. Pessoas autorizadas


| Nome                            | Função        | Situação               |
| ------------------------------- | ------------- | ---------------------- |
| Ricardo David                   | Administrador | Já autorizado          |
| Carlos Eduardo de França Roland | Administrador | Autorização solicitada |
| Laura Costa Nunes               | Programador   | Autorização solicitada |
| Luciano Neves Mazarão Junior    | Programador   | Autorização solicitada |
| Marina Neves Andrade            | Programador   | Autorização solicitada |
| Felipe Jorge Battarra           | Programador   | Autorização solicitada |


> Os dados pessoais (CPF) ficam no registro interno do DTI, em atendimento à LGPD (Lei Geral de Proteção de Dados).

---



## 3. Dados de conexão


| Item              | Valor                                          |
| ----------------- | ---------------------------------------------- |
| Servidor VPN      | `170.231.100.140:8443`                         |
| Servidor SSH      | `172.21.3.182`                                 |
| Porta SSH         | `22022` (a padrão seria 22)                    |
| Usuário (exemplo) | `ricardo.david`                                |
| Senha             | Mesma senha do AD (computadores da Prefeitura) |
| Domínio AD        | `FRANCA`                                       |


---



## 4. Fluxo geral

1. Está dentro da rede da Prefeitura? Se sim, vá direto ao passo 4.
2. Se não, instale e conecte a VPN (Seção 5 para Windows ou Seção 6 para Linux).
3. Confirme que a VPN está conectada (ícone verde no Windows ou interface `tun0` ativa no Linux).
4. Acesse o servidor por SSH:
  Windows: PuTTY ou VS Code (Seção 7).
   Linux: terminal ou VS Code (Seção 8).
5. Faça login com usuário e senha do AD.

---



## 5. VPN no Windows (WatchGuard Mobile VPN with SSL)

1. Baixe o instalador:
  [https://cdn.watchguard.com/SoftwareCenter/Files/MUVPN_SSL/12_7_2/WG-MVPN-SSL_12_7_2.exe`](https://cdn.watchguard.com/SoftwareCenter/Files/MUVPN_SSL/12_7_2/WG-MVPN-SSL_12_7_2.exe`)
2. Execute e siga o assistente (Avançar, Instalar, Concluir).
3. Abra **Iniciar > Mobile VPN with SSL client**.
4. Observe o ícone na bandeja do sistema (canto inferior direito):
  Cinza: VPN desconectada.
   Verde: VPN conectada.
5. Clique com o botão direito no ícone e escolha **Connect...**
6. Preencha:
  **Server:** `170.231.100.140:8443`
   **User name:** seu usuário da Prefeitura (ex.: `ricardo.david`)
   **Password:** sua senha da Prefeitura
7. Opcional: **Reconectar automaticamente**. Em computador compartilhado, não marque "Lembrar senha".
8. Clique em **Connect** e confirme a mensagem.
9. Com o ícone **verde**, a VPN está ativa.

> Anote o IP do seu computador na Prefeitura. Ele é necessário para a área de trabalho remota.

---



## 6. VPN no Linux (OpenVPN com arquivo .ovpn)

O cliente oficial da WatchGuard não existe para Linux. O firewall usa OpenVPN, então o acesso é feito com um arquivo de configuração `.ovpn`.

### 6.1 Como obter o arquivo .ovpn

1. Solicite o arquivo ao responsável do DTI: **Ricardo David**.
2. Informe: nome completo, função, usuário do AD e distribuição Linux utilizada.
3. O arquivo é pessoal e intransferível. Guarde-o em `~/.vpn/pmf.ovpn` e não o compartilhe.



### 6.2 Instalação e conexão

```bash
sudo apt update
sudo apt install openvpn -y
mkdir -p ~/.vpn && chmod 700 ~/.vpn
chmod 600 ~/.vpn/pmf.ovpn
sudo openvpn --config ~/.vpn/pmf.ovpn
```

Informe usuário e senha do seu usuário linux da sua máquina (ou da Prefeitura para Funcionários DTI) quando solicitado.  
Depois informe Usuário do AD e senha do AD

isso deverá crira ou abrir a conexão VPN

Mantenha este terminal aberto. Em outro terminal, confira a interface do túnel:

```bash
ip a show tun0
```

Se `tun0` aparecer com um IP, a VPN está ativa. Para encerrar, pressione `Ctrl+C` no terminal da VPN.

---



## 7. SSH a partir do Windows



### 7.1 PuTTY

1. Baixe e instale o PuTTY em `https://www.putty.org`.
2. Em **Session**, preencha:
  **Host Name (or IP address):** `172.21.3.182`
   **Port:** `22022`
   **Connection type:** `SSH`
3. Em **Saved Sessions**, digite `Servidor-Prefeitura` e clique em **Save**.
4. Clique em **Open**.
5. No aviso **PuTTY Security Alert**, confira a impressão digital (*fingerprint*) com o DTI e clique em **Accept**.
6. Faça login:
  `ogin as: ricardo.david icardo.david@172.21.3.182's password: ********`
   senha não aparece enquanto é digitada. Isso é normal.
7. Se o servidor exigir o domínio, use `ricardo.david@franca` (UPN) ou `FRANCA\ricardo.david` (NetBIOS).



### 7.2 Visual Studio Code (Remote-SSH)

1. Instale o VS Code em `https://code.visualstudio.com`.
2. Em **Extensions** (`Ctrl+Shift+X`), instale **Remote - SSH** (Microsoft).
3. No PowerShell, confirme o cliente OpenSSH com `ssh -V`. Se faltar, ative em **Configurações > Aplicativos > Recursos opcionais > Cliente OpenSSH**.
4. Pressione `F1`, escolha **Remote-SSH: Open SSH Configuration File...** e selecione `C:\Users\SEU_USUARIO\.ssh\config`.
5. Adicione:
  `ost servidor-prefeitura    HostName 172.21.3.182    Port 22022    User ricardo.david`
6. Pressione `F1`, escolha **Remote-SSH: Connect to Host...** e selecione `servidor-prefeitura`.
7. Informe a senha do AD e escolha **Linux** como plataforma.
8. Com o texto `SSH: servidor-prefeitura` no canto inferior esquerdo, a conexão está ativa. Use **File > Open Folder** para abrir pastas do servidor.

---



## 8. SSH a partir do Linux



### 8.1 Terminal

```bash
ssh -p 22022 ricardo.david@172.21.3.182
```

Onde: `ssh` é o cliente Secure Shell; `-p 22022` define a porta; `ricardo.david` é o usuário do AD; `172.21.3.182` é o servidor.

Se o AD exigir o domínio:

```bash
ssh -p 22022 ricardo.david@franca@172.21.3.182
ssh -p 22022 'FRANCA\ricardo.david'@172.21.3.182
```

Na primeira conexão, confira a impressão digital com o DTI, digite `yes` e informe a senha.

### 8.2 Atalho em ~/.ssh/config

```
Host servidor-prefeitura
  HostName 172.21.3.182
  Port 22022
  User ricardo.david
```

Depois, conecte com:

```bash
ssh servidor-prefeitura
```



### 8.3 VS Code no Linux

Siga os passos da Seção 7.2. O cliente SSH já vem instalado na maioria das distribuições.

---



## 9. Teste de conectividade

- Windows (PowerShell): `Test-NetConnection 172.21.3.182 -Port 22022`. O esperado é `TcpTestSucceeded : True`.
- Linux: `nc -zv 172.21.3.182 22022`. O esperado é `succeeded!`.

---



## 10. Solução de problemas


| Sintoma                                | Causa provável                              | Solução                                                               |
| -------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| `Connection timed out`                 | VPN desconectada ou porta bloqueada         | Verifique a VPN e a liberação da porta com o DTI                      |
| `Connection refused`                   | Porta errada ou serviço parado              | Confirme a porta `22022`                                              |
| `Permission denied`                    | Usuário/senha incorretos ou conta bloqueada | Teste a senha em um computador da Prefeitura e tente `usuario@franca` |
| Aviso de chave alterada                | Servidor reinstalado ou ataque              | Confirme com o DTI antes de aceitar                                   |
| VPN Linux sem `tun0`                   | `.ovpn` incorreto ou credenciais erradas    | Reveja a Seção 6 e solicite novo arquivo ao DTI                       |
| VS Code trava em "Setting up SSH Host" | Falta de permissão ou internet no servidor  | Veja **Output > Remote-SSH**                                          |


---



## 11. Boas práticas de segurança

- Desconecte a VPN ao terminar.
- Não compartilhe senha do AD nem o arquivo `.ovpn`.
- Use chaves SSH em vez de senha, se o DTI permitir.
- Confira sempre a impressão digital do servidor na primeira conexão.
- Comunique ao DTI qualquer perda de equipamento com o `.ovpn` instalado.

---



## 12. Contato

**Responsável DTI:** Ricardo David – Administrador
**Setor:** DTI – Prefeitura Municipal de Franca