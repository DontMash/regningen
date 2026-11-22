# Changelog

## v1.1.0

[compare changes](https://github.com/DontMash/regningen/compare/v1.0.0...v1.1.0)

### 🚀 Enhancements

- **ui:** Add footer legal links ([2891d19](https://github.com/DontMash/regningen/commit/2891d19))
- **pwa:** Add installable offline invoicing with safe updates ([e779f0e](https://github.com/DontMash/regningen/commit/e779f0e))
- **pwa:** Adopt plugin updates and autosave Invoice Drafts ([7f433bb](https://github.com/DontMash/regningen/commit/7f433bb))
- **invoicing:** Move PDF export to the invoice summary ([094e5b6](https://github.com/DontMash/regningen/commit/094e5b6))
- **settings:** Centralize preferences and explicit profile saving ([2bb5130](https://github.com/DontMash/regningen/commit/2bb5130))
- **ui:** Add responsive header navigation ([1728337](https://github.com/DontMash/regningen/commit/1728337))
- **visibility:** Add public landing page and origin-aware discovery ([fffb156](https://github.com/DontMash/regningen/commit/fffb156))
- **security:** Enforce browser policies and private attribution ([15cdc05](https://github.com/DontMash/regningen/commit/15cdc05))
- **config:** Validate deployment inputs and unify env loading ([943922b](https://github.com/DontMash/regningen/commit/943922b))
- **i18n:** Add German and English invoice workflows ([51cb5b4](https://github.com/DontMash/regningen/commit/51cb5b4))
- **ui:** Add Ko-fi support link to footer ([4e8accc](https://github.com/DontMash/regningen/commit/4e8accc))
- **licensing:** Add AGPL grant and build-local license notices ([c252f30](https://github.com/DontMash/regningen/commit/c252f30))
- **i18n:** Add German and English invoice workflows ([3458f43](https://github.com/DontMash/regningen/commit/3458f43))
- Link project source from footer and license page ([19713ab](https://github.com/DontMash/regningen/commit/19713ab))
- Add gated Actions releases and Dokploy image deployment ([e02b2a4](https://github.com/DontMash/regningen/commit/e02b2a4))

### 🩹 Fixes

- Update content layout ([cc1cab1](https://github.com/DontMash/regningen/commit/cc1cab1))
- **settings:** Preserve native license disclosure during hydration ([308b3f8](https://github.com/DontMash/regningen/commit/308b3f8))
- **ui:** Stabilize toast layout and browser verification ([5899814](https://github.com/DontMash/regningen/commit/5899814))
- **appearance:** Keep session choices coherent when storage fails ([d932a54](https://github.com/DontMash/regningen/commit/d932a54))
- **appearance:** Integrate session-first theme selection ([2534f7a](https://github.com/DontMash/regningen/commit/2534f7a))
- **invoicing:** Restore calendar keyboard focus and selection ([00235f0](https://github.com/DontMash/regningen/commit/00235f0))
- **visibility:** Establish typed deployment route context ([f9e76c8](https://github.com/DontMash/regningen/commit/f9e76c8))
- **vitals:** Declare test-owned indexability expectations ([f5a3fc1](https://github.com/DontMash/regningen/commit/f5a3fc1))
- **a11y:** Make field guidance keyboard accessible and associated ([61b9b71](https://github.com/DontMash/regningen/commit/61b9b71))
- **vitals:** Integrate explicit indexability expectations ([1d1e3ef](https://github.com/DontMash/regningen/commit/1d1e3ef))
- **invoicing:** Integrate actual calendar keyboard focus ([a1f580e](https://github.com/DontMash/regningen/commit/a1f580e))
- **invoicing:** Validate document generation before PDF rendering ([746bd34](https://github.com/DontMash/regningen/commit/746bd34))
- **visibility:** Integrate typed deployment route context ([ffd0f7d](https://github.com/DontMash/regningen/commit/ffd0f7d))
- **invoicing:** Reject obsolete profile backup imports ([b87f8f5](https://github.com/DontMash/regningen/commit/b87f8f5))
- **invoicing:** Integrate validated document generation ([f64ad73](https://github.com/DontMash/regningen/commit/f64ad73))
- **invoicing:** Integrate profile import lifecycle ([e47f2c6](https://github.com/DontMash/regningen/commit/e47f2c6))
- **a11y:** Integrate accessible field guidance ([b6d06f8](https://github.com/DontMash/regningen/commit/b6d06f8))
- Finish standards review lifecycle and failure corrections ([6b77ffb](https://github.com/DontMash/regningen/commit/6b77ffb))
- Integrate final standards review corrections ([173ab84](https://github.com/DontMash/regningen/commit/173ab84))
- **ci:** Check out the repository before using the local setup action ([21ccea7](https://github.com/DontMash/regningen/commit/21ccea7))
- **ci:** Pass node path and probe to the offline inner shell correctly ([23c566d](https://github.com/DontMash/regningen/commit/23c566d))
- **ci:** Format generated changelog and run Validate once per change ([2944f4d](https://github.com/DontMash/regningen/commit/2944f4d))
- **release:** Stage the formatted changelog before amending the release commit ([939d45d](https://github.com/DontMash/regningen/commit/939d45d))

### 💅 Refactors

- **licensing:** Simplify Settings and accompanying notices ([9f60ba4](https://github.com/DontMash/regningen/commit/9f60ba4))
- **release-notes:** Supply acknowledgment persistence ([bc311e4](https://github.com/DontMash/regningen/commit/bc311e4))
- **release-notes:** Integrate supplied acknowledgment persistence ([40ec4d9](https://github.com/DontMash/regningen/commit/40ec4d9))
- **invoicing:** Isolate business validation from packages ([e88b7d8](https://github.com/DontMash/regningen/commit/e88b7d8))
- **invoicing:** Supply draft persistence and recovery ([ccd1ad2](https://github.com/DontMash/regningen/commit/ccd1ad2))
- **invoicing:** Integrate independent business validation ([ba760b2](https://github.com/DontMash/regningen/commit/ba760b2))
- **invoicing:** Integrate supplied draft persistence ([7e36af4](https://github.com/DontMash/regningen/commit/7e36af4))
- **invoicing:** Centralize position editing decisions ([c068126](https://github.com/DontMash/regningen/commit/c068126))
- **invoicing:** Make profile operations authoritative ([634d782](https://github.com/DontMash/regningen/commit/634d782))
- **invoicing:** Integrate authoritative profile operations ([514643e](https://github.com/DontMash/regningen/commit/514643e))
- **invoicing:** Integrate position editing decisions ([a659d93](https://github.com/DontMash/regningen/commit/a659d93))
- **invoicing:** Use one authoritative invoice draft ([055b8d3](https://github.com/DontMash/regningen/commit/055b8d3))
- **invoicing:** Integrate authoritative invoice draft ([2eb8a70](https://github.com/DontMash/regningen/commit/2eb8a70))
- **architecture:** Retire adapters and guard dependency boundaries ([a367457](https://github.com/DontMash/regningen/commit/a367457))
- Integrate adapter retirement and dependency boundaries ([86c929b](https://github.com/DontMash/regningen/commit/86c929b))
- Reduce custom infrastructure and simplify PWA integration ([4de32f4](https://github.com/DontMash/regningen/commit/4de32f4))
- Centralize shared policy and persistence identities ([3024f2a](https://github.com/DontMash/regningen/commit/3024f2a))
- Deepen Business Profile editing and discard protection ([282398c](https://github.com/DontMash/regningen/commit/282398c))

### 📖 Documentation

- **releasing:** Simplify release workflow documentation ([7cb654f](https://github.com/DontMash/regningen/commit/7cb654f))
- Establish judgment-based coding standards ([659e176](https://github.com/DontMash/regningen/commit/659e176))
- Simplify README for project newcomers ([541ac3e](https://github.com/DontMash/regningen/commit/541ac3e))

### 🏡 Chore

- Add PR-writing skill ([ade4570](https://github.com/DontMash/regningen/commit/ade4570))
- Update shadcn and unslop skills ([0317ea9](https://github.com/DontMash/regningen/commit/0317ea9))

### ✅ Tests

- **e2e:** Split app shell specs and robots by feature ([39b89e4](https://github.com/DontMash/regningen/commit/39b89e4))
- **vitals:** Add native Playwright Lighthouse audits ([87d60ce](https://github.com/DontMash/regningen/commit/87d60ce))
- **a11y:** Verify visible guidance alongside field descriptions ([e56e107](https://github.com/DontMash/regningen/commit/e56e107))
- **pwa:** Integrate explicit update discoverability checks ([7cf00ac](https://github.com/DontMash/regningen/commit/7cf00ac))
- Model browser profile storage failures accurately ([5f10593](https://github.com/DontMash/regningen/commit/5f10593))

### 🤖 CI

- Split Validate workflow into parallel jobs ([ab66e50](https://github.com/DontMash/regningen/commit/ab66e50))
- Drop the offline network-isolation wrapper from CI gates ([c627d72](https://github.com/DontMash/regningen/commit/c627d72))

### ❤️ Contributors

- Sören Maschmann <soeren@maschmann.online>

## v1.0.0

### 🚀 Enhancements

- **invoicing:** Add local-first invoicing workflow (ecf707c)
- **invoicing:** Refine invoice editing and PDF layout (8df6995)
- **ui:** Add browser favicons (8ad0467)
- **ui:** Add typeset-aligned typography roles (1e85efc)
- **ui:** Add shared footer and accessible back-to-top navigation (87a8e79)

### 🩹 Fixes

- **invoicing:** Align form fields and validation feedback (6c53836)
- **ui:** Skip field hints in tab order (0e88064)

### 💅 Refactors

- Refresh app configuration and theme handling (212d27c)

### 📖 Documentation

- **testing:** Define unit and integration test intent (59f1b94)

### 🏡 Chore

- Initialize application (955fcc6)
- Remove scratch dir (ee9f21d)
- Update skills (84ddc82)

### ✅ Tests

- Add Vitest coverage gate and workflow tests (e54c905)
- **e2e:** Migrate suite to feature-oriented robots (169f434)
- **integration:** Strengthen outcome assertions (d3856cd)
- Organize support modules by runner (d033243)
- **vitest:** Migrate module suites to robots and scenarios (c71850d)
- **vitest:** Enforce all coverage metrics and cover draft resets (f16bb79)

### ❤️ Contributors

- Sören Maschmann <soeren@maschmann.online>
