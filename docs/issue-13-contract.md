> **Historical snapshot — not the operational contract.** This document is
> the Fase 1 baseline snapshot for issue #13. The current source of truth
> for installation, upgrade, uninstall, and troubleshooting is
> [`docs/INSTALL.md`](docs/INSTALL.md).
>
> The snapshot also predates issue #99, which removed the manual installer it
> describes (`scripts/install.mjs`). Its items 5 and 6 are kept verbatim as the
> historical record of that decision; the live model is the unified plugin
> package installed by `hermes plugins install`.

# Issue #13 — Contrato upstream e decisões seladas (Fase 1: nota de contrato — snapshot baseline; fases 2–3: implementação concluída)

> Escopo desta fase: **somente registrar** o contrato upstream real e as
> decisões da issue #13 com citações verificáveis. Este documento é o
> snapshot baseline da Fase 1: no baseline, nenhum `plugin.yaml` existia e
> nenhum código havia sido alterado. As fases 2–3 concluíram a
> implementação criando o manifesto e os gates de paridade.

## 1. Fontes upstream reais inspecionadas

| Fonte | Revisão / versão observada | Como verificar |
|---|---|---|
| `hermes-agent` checkout used in Fase 1 | commit `4e966506cff94d344377198d187d46bb59ac050c`, `hermes --version` → `v0.21.4 (2026.9.21)` | `git -C <hermes-agent> rev-parse HEAD && hermes --version` |
| `hermes_cli/plugin_validate.py` | mesmo checkout | `sed -n '70,125p' hermes_cli/plugin_validate.py` |
| `hermes_cli/plugins_manifest.py` | mesmo checkout | `sed -n '30,42p;345,370p' hermes_cli/plugins_manifest.py` |
| `apps/desktop/src/contrib/plugin.ts` (interface `HermesPlugin`) | mesmo checkout | `sed -n '133,149p' apps/desktop/src/contrib/plugin.ts` |
| `apps/desktop/src/contrib/plugins-store.ts:64`, `runtime-loader.ts:395` (default de `defaultEnabled`) | mesmo checkout | `grep -rn "defaultEnabled" apps/desktop/src/` |
| Exemplos upstream `plugin-llm-example/plugin.yaml`, `plugin-llm-async-example/plugin.yaml` | cópia temporária inspecionada na Fase 1 | `plugin-llm-example/plugin.yaml` no tree de exemplos do hermes-agent |

## 2. Contrato `plugin.yaml` (validador real)

- **Obrigatórios:** `name`, `version`, `description` —
  `hermes_cli/plugin_validate.py:96-107` (`_check_manifest_fields`; falha com
  `plugin.yaml missing required field(s)` se qualquer um faltar).
- **`requires_hermes` é opcional:** ausente/vazio passa —
  `plugin_validate.py:110-114` (`report.add("requires_hermes", True, "not declared")`
  e retorno). Quando declarado, precisa parsear (`:115-124`); no carregamento,
  string vazia desliga o gate — `plugins_manifest.py:364`
  (`requires_hermes: str = ""`) e `:445-452` (`requires_hermes_error`
  retorna `None` sem spec).
- **`provides_tools` / `provides_hooks` default `[]`** —
  `plugins_manifest.py:350-351` (`field(default_factory=list)`); ambos são
  campos conhecidos — `:34-39` (`_KNOWN_MANIFEST_FIELDS`). Os exemplos
  upstream usam a variante `hooks: []` + `provides.commands`
  (`plugin-llm-example/plugin.yaml`);
  este plugin declara o par `provides_tools`/`provides_hooks` vazio (forma
  canônica do manifesto v2 lida em `plugins_manifest.py:513-517`).
- **Nenhum `plugin.yaml` existia no baseline da Fase 1** (verificado:
  `ls plugin.yaml` → `No such file or directory` no baseline `ea1b10f`);
  o manifesto foi criado nas fases 2–3.

## 3. Contrato do descritor Desktop (`HermesPlugin`)

`apps/desktop/src/contrib/plugin.ts:133-149`:

```ts
export interface HermesPlugin {
  id: string          // obrigatório — vira `plugin:<id>` source + namespace
  name?: string       // opcional — nome humano em settings/about
  description?: string // opcional — one-liner do inventário de settings
  defaultEnabled?: boolean // opcional — default true; false = opt-in
  register: (ctx: PluginContext) => void // obrigatório — chamado uma vez no load
}
```

- **`defaultEnabled` default é `true`** quando não escolhido pelo usuário —
  `plugins-store.ts:64` (`pluginActive(id, defaultEnabled = true)`) e
  `runtime-loader.ts:395` (`(plugin.defaultEnabled ?? true)`).
- Espelho local fiel: `src/types/plugin-sdk.d.ts:63-69` declara o mesmo
  `HermesPlugin` (`id` obrigatório; `name?`/`description?`/`defaultEnabled?`
  opcionais). O shim documenta a verificação contra
  `hermes-agent/apps/desktop/src/sdk/index.ts` em 2026-09-23
  (`src/types/plugin-sdk.d.ts:11-25`).

## 4. Decisões seladas

1. **`name`/`version`/`description` do futuro `plugin.yaml` vêm de
   `package.json`** (`name: hermes-routines`, `version: 0.1.0`,
   `description: "Standalone Hermes Desktop plugin for managing scheduled routines"`),
   mantendo a regra de fonte-única já aplicada ao artefato
   (`scripts/check-version.mjs` + `scripts/build.mjs` injetando
   `__PLUGIN_VERSION__`; `src/plugin.tsx:17-20`).
2. **`requires_hermes` OMITIDO — nenhuma versão inventada.** A versão
   observada em execução é `v0.21.4`, mas fixar um piso (ex. `>=0.21`)
   sem testar o plugin contra hosts antigos seria invenção; o validador
   aceita a omissão (`plugin_validate.py:110-114`). A fase que criar o
   manifesto deve re-verificar a versão mínima real antes de declarar.
3. **`provides_tools: []` / `provides_hooks: []`.** O plugin não expõe
   ferramentas nem hooks ao host: chama o gateway via
   `host.requestProfile`/`host.request` (`src/types/plugin-sdk.d.ts:73-86`)
   e só registra contribuições `routes` + `sidebar.nav`
   (`src/plugin.tsx:32-45`). Declarar listas vazias é consentimento
   explícito sem grant (ver `plugins_manifest.py` — declaração é
   metadado, não concessão).
4. **Descritor com `description` + `defaultEnabled: false` (opt-in).**
   A issue #13 exige `defaultEnabled` preferencialmente `false` salvo
   evidência upstream contrária; o upstream confirma que `false` =
   opt-in inventariado em Capabilities ▸ Plugins, desligado até o
   usuário ativar (`contrib/plugin.ts:140-143`). Decisão: `false`.
5. **Identidade: `PLUGIN_ID = 'hermes-routines'` ≠ `ROUTE_ID = 'routines'`
   = diretório de instalação.** `src/constants.ts:6-11` define
   `PLUGIN_ID` (vira a tag `plugin:<id>`), `ROUTE_ID`/`ROUTE_PATH`
   (`/routines`); `scripts/install.mjs:13-15` fixa
   `PLUGIN_ID='hermes-routines'`, `PLUGIN_DIR_NAME='routines'`,
   `PLUGIN_FILE_NAME='plugin.js'`; `docs/INSTALL.md` (Mapping) confirma
   `desktop/plugin.js` → `<profile-home>/plugins/routines/plugin.js`.
6. **Layout unificado do pacote vs. instalação flat.** Fonte única
   `src/**/*.ts(x)` → `desktop/plugin.js` gerado e determinístico
   (`scripts/build.mjs`, banner `AUTO-GENERATED — DO NOT EDIT`,
   `desktop/plugin.js:1-3`); a instalação copia **um único arquivo**
   byte-idêntico (sha256 antes/depois do rename atômico —
   `scripts/install.mjs:2-6`, `docs/INSTALL.md`). O futuro `plugin.yaml`
   vive na raiz do pacote sem alterar esse fluxo.
7. **Sem backend Python.** Nenhum `*.py` no repo (verificado com
   `find . -name "*.py" -not -path "./node_modules/*"` → vazio); sem
   `plugin_api.py`; a porta sancionada (`ctx.rest` → `/api/plugins/<id>`)
   não é usada. Nada a declarar em `python_dependencies`/`requires_env`.

## 5. Aceite da issue #13 (baseline da Fase 1; implementação concluída nas fases 2–3)

`hermes plugins validate <dir>` deve passar no commit real, sem manifesto
temporário e sem drift (`package.json` ↔ artefato ↔ `plugin.yaml`).
Comandos de verificação do snapshot baseline da Fase 1 (todos executados então, sem edição):

- `git rev-parse HEAD` → `ea1b10fc746061eadaf60f94b934258b82a92b6d`
- `git status --porcelain` → limpo
- `find . -name "*.py" -not -path "./node_modules/*"` → vazio
- `ls plugin.yaml` → inexistente (esperado nesta fase)
- `hermes plugins validate --help` → validador disponível (`path` posicional)
