// Gerador de script de monitoramento para MikroTik (Winbox).
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciarServidor, abrirNavegador, abrirPagina, esperarDiagrama } = require("./ajuda");

let site, navegador;
test.before(async () => { site = await iniciarServidor(); navegador = await abrirNavegador(); });
test.after(async () => { await navegador?.close(); await site?.fechar(); });

// RB em Passo Fundo: uplink no switch pela ether1, VOLT e XPS na mesma /29
// (ether2 e ether3) e uma câmera numa /30 (ether4).
const projeto = { "POP PFU": {
  equipamentos: [
    { id: "rb", nome: "RB-MON PFU", tipo: "MikroTik", modelo: "RB4011iGS+", ip: "10.50.0.2/30", gateway: "10.50.0.1", status: "ativo" },
    { id: "sw", nome: "core-l2-pf-01", tipo: "Switch", ip: "10.0.0.1", status: "ativo" },
    { id: "volt", nome: "VOLT PFU", tipo: "VOLT", ip: "10.60.0.2", mascara: "/29", gateway: "10.60.0.1", status: "ativo" },
    { id: "xps", nome: "XPS PFU", tipo: "RPS", ip: "10.60.0.3", mascara: "255.255.255.248", gateway: "10.60.0.1", status: "ativo" },
    { id: "cam", nome: "Camera PFU", tipo: "Camera IP", ip: "10.70.0.2", mascara: "/30", gateway: "10.70.0.1", status: "ativo" }
  ],
  conexoes: [
    { de: "sw", para: "rb", tipo: "Fibra", saida: "XE1/1/2", chegada: "ether1" },
    { de: "rb", para: "volt", tipo: "Cobre", saida: "ether2", chegada: "eth0" },
    { de: "rb", para: "xps", tipo: "Cobre", saida: "ether3", chegada: "eth0" },
    { de: "rb", para: "cam", tipo: "Cobre", saida: "ether4", chegada: "eth0" }
  ]
} };

test("Script MikroTik: preenche pelo diagrama (VLAN 216 de PFU, IP /30, uplink, bridge da /29 e câmera /30) e gera o script do procedimento", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 }, projetos: projeto });
  await esperarDiagrama(pagina);
  await pagina.click("#btnScriptMikrotik");
  await pagina.waitForSelector("#mkModal:not(.hidden)");
  assert.equal(await pagina.inputValue("#mkRb"), "rb", "a única MikroTik já vem escolhida");
  assert.equal(await pagina.inputValue("#mkLocal"), "PFU");
  assert.equal(await pagina.inputValue("#mkVlan"), "216");
  assert.equal(await pagina.inputValue("#mkUplink"), "ether1");
  assert.equal(await pagina.inputValue("#mkIp"), "10.50.0.2/30");
  assert.equal(await pagina.inputValue("#mkGateway"), "10.50.0.1");
  const script = await pagina.inputValue("#mkScript");
  for (const linha of [
    "/interface vlan",
    'add name=vlan216-eth01 interface=ether1 vlan-id=216 comment="Monitoramento PFU"',
    'add address=10.50.0.2/30 interface=vlan216-eth01 comment="RB monitoramento"',
    'add dst-address=0.0.0.0/0 gateway=10.50.0.1 comment="Gateway monitoramento"',
    'add name=bridge-monitoramento comment="Monitoramento"',
    "add bridge=bridge-monitoramento interface=ether2",
    "add bridge=bridge-monitoramento interface=ether3",
    'add address=10.60.0.1/29 interface=bridge-monitoramento comment="Equipamentos monitoramento"',
    'add address=10.70.0.1/30 interface=ether4 comment="Cameras"'
  ]) assert.ok(script.includes(linha), "falta no script: " + linha + "\n\n" + script);
  // Uplink pela fibra: a VLAN vira vlan216-sfp.
  await pagina.fill("#mkUplink", "sfp1");
  assert.match(await pagina.inputValue("#mkScript"), /add name=vlan216-sfp interface=sfp1 vlan-id=216/);
  // Erro de preenchimento: porta da rede igual à de uplink não gera script.
  await pagina.fill("#mkUplink", "ether2");
  assert.match(await pagina.inputValue("#mkScript"), /^# Falta preencher:[\s\S]*porta ether2 é a de uplink/);
  assert.equal(await pagina.isDisabled("#mkCopiar"), true);
  await pagina.fill("#mkUplink", "ether1");
  // Outro local pela tabela: IBR → VLAN 212.
  await pagina.fill("#mkLocal", "IBR");
  assert.equal(await pagina.inputValue("#mkVlan"), "212");
  assert.match(await pagina.inputValue("#mkScript"), /add name=vlan212-eth01 interface=ether1 vlan-id=212/);
  // Baixar .rsc
  const [download] = await Promise.all([pagina.waitForEvent("download"), pagina.click("#mkBaixar")]);
  assert.equal(download.suggestedFilename(), "RB-MON-PFU-monitoramento.rsc");
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});

test("Script MikroTik pelo editor do equipamento e tabela de VLANs editável", async () => {
  const pagina = await abrirPagina(navegador, site, { viewport: { width: 1400, height: 900 }, projetos: projeto });
  await esperarDiagrama(pagina);
  await pagina.click("#btnScriptMikrotik");
  await pagina.click(".mk-tabela summary");
  await pagina.fill("#mkTabela", "IBR=212\nPFU=316\nSCR=215\nMRU=230");
  await pagina.click("#mkSalvarTabela");
  assert.equal(await pagina.inputValue("#mkVlan"), "316", "PFU com a VLAN nova da tabela");
  await pagina.click("#mkModal [data-mk-fechar]");
  // Reabre: a tabela ficou guardada.
  await pagina.click("#btnScriptMikrotik");
  assert.match(await pagina.inputValue("#mkTabela"), /MRU=230/);
  assert.match(await pagina.inputValue("#mkScript"), /vlan-id=316/);
  assert.deepEqual(pagina.erros, []);
  await pagina.context().close();
});
