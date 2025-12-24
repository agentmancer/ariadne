# Open Source Release Checklist

Preparing Sherlock for public release under a **non-commercial license**.

---

## License Selection

### Recommended: Commons Clause + Apache 2.0

The **Commons Clause** is a license condition that restricts commercial use while allowing open collaboration:

```
"Commons Clause" License Condition v1.0

The Software is provided to you by the Licensor under the License,
as defined below, subject to the following condition.

Without limiting other conditions in the License, the grant of rights
under the License will not include, and the License does not grant to
you, the right to Sell the Software.
```

Combined with Apache 2.0, this allows:
- ✅ Free use for research and education
- ✅ Modification and redistribution
- ✅ Commercial use of research outputs (papers, findings)
- ❌ Selling the software itself
- ❌ Offering as a commercial SaaS

### Alternative Options

| License | Use Case | Notes |
|---------|----------|-------|
| **CC BY-NC-SA 4.0** | Academic sharing | Not OSI-approved, may conflict with dependencies |
| **AGPL-3.0** | Strong copyleft | Requires source disclosure, commercial use allowed |
| **PolyForm Noncommercial** | Modern NC license | Clearer terms than CC for software |
| **BSL 1.1** | Time-delayed open source | Becomes open after N years |
| **Custom Academic License** | Full control | Requires legal review |

---

## Pre-Release Checklist

### 1. Code Cleanup

- [ ] **Remove hardcoded secrets/credentials**
  ```bash
  # Search for potential secrets
  grep -r "sk-" --include="*.ts" .
  grep -r "password" --include="*.ts" .
  grep -r "secret" --include="*.ts" .
  grep -r "api_key" --include="*.ts" .
  ```

- [ ] **Audit .env files**
  - [ ] Ensure `.env` is in `.gitignore`
  - [ ] Create `.env.example` with placeholder values
  - [ ] Document all required environment variables

- [ ] **Remove internal references**
  - [ ] Internal URLs/domains
  - [ ] Private API endpoints
  - [ ] Institution-specific configurations

- [ ] **Clean git history** (if needed)
  ```bash
  # Use BFG Repo-Cleaner for sensitive data
  bfg --delete-files "*.env"
  bfg --replace-text passwords.txt
  ```

### 2. Documentation

- [ ] **README.md** - Complete rewrite for public audience
  - [ ] Project description and motivation
  - [ ] Features list
  - [ ] Quick start guide
  - [ ] Screenshots/demo
  - [ ] Link to paper (when published)

- [ ] **CONTRIBUTING.md**
  - [ ] How to set up development environment
  - [ ] Code style guidelines
  - [ ] Pull request process
  - [ ] Issue templates

- [ ] **LICENSE** file
  - [ ] Full license text
  - [ ] Commons Clause addition (if using)

- [ ] **CHANGELOG.md**
  - [ ] Version history
  - [ ] Breaking changes

- [ ] **docs/** folder
  - [ ] Architecture overview
  - [ ] API documentation
  - [ ] Plugin development guide
  - [ ] Deployment guide

### 3. Dependency Audit

- [ ] **Check license compatibility**
  ```bash
  # Install license checker
  npx license-checker --summary
  npx license-checker --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC"
  ```

- [ ] **Document all dependencies**
  - [ ] Create THIRD_PARTY_LICENSES.md
  - [ ] Note any copyleft dependencies (GPL, LGPL)

- [ ] **Update outdated packages**
  ```bash
  pnpm outdated
  pnpm update
  ```

- [ ] **Security audit**
  ```bash
  pnpm audit
  ```

### 4. Code Quality

- [ ] **Remove TODO/FIXME comments** (or document them as issues)
  ```bash
  grep -r "TODO" --include="*.ts" . | wc -l
  grep -r "FIXME" --include="*.ts" . | wc -l
  ```

- [ ] **Ensure tests pass**
  ```bash
  pnpm test
  pnpm lint
  pnpm type-check
  ```

- [ ] **Add/update code comments**
  - [ ] Public API documentation
  - [ ] Complex algorithm explanations

### 5. Repository Setup

- [ ] **GitHub repository settings**
  - [ ] Public visibility
  - [ ] Description and topics
  - [ ] Website link (if applicable)
  - [ ] Disable wiki (use docs/ instead)

- [ ] **Branch protection**
  - [ ] Protect main branch
  - [ ] Require PR reviews
  - [ ] Require CI passing

- [ ] **Issue templates**
  - [ ] Bug report template
  - [ ] Feature request template
  - [ ] Question template

- [ ] **GitHub Actions CI**
  - [ ] Lint and type-check
  - [ ] Run tests
  - [ ] Build check

- [ ] **Releases**
  - [ ] Create v1.0.0 tag
  - [ ] Write release notes
  - [ ] Attach build artifacts (if applicable)

### 6. Security

- [ ] **Security policy** (SECURITY.md)
  - [ ] How to report vulnerabilities
  - [ ] Supported versions
  - [ ] Response timeline

- [ ] **Code scanning**
  - [ ] Enable GitHub Dependabot
  - [ ] Enable CodeQL analysis
  - [ ] Run Snyk or similar

### 7. Community

- [ ] **Code of Conduct** (CODE_OF_CONDUCT.md)
  - [ ] Contributor Covenant recommended

- [ ] **Discussion/Support channels**
  - [ ] GitHub Discussions enabled
  - [ ] Or link to external forum

- [ ] **Acknowledgments**
  - [ ] Contributors list
  - [ ] Funding acknowledgments
  - [ ] Related projects

---

## License File Template

Create `LICENSE` file:

```
Apache License 2.0 with Commons Clause

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

---

"Commons Clause" License Condition v1.0

The Software is provided to you by the Licensor under the License,
as defined below, subject to the following condition.

Without limiting other conditions in the License, the grant of rights
under the License will not include, and the License does not grant to
you, the right to Sell the Software.

For purposes of the foregoing, "Sell" means practicing any or all of
the rights granted to you under the License to provide to third parties,
for a fee or other consideration (including without limitation fees for
hosting or consulting/support services related to the Software), a
product or service whose value derives, entirely or substantially, from
the functionality of the Software.

Any license notice or attribution required by the License must also
include this Commons Clause License Condition notice.

Software: Sherlock
License: Apache 2.0
Licensor: [Your Name/Institution]
```

---

## Pre-Launch Timeline

### Week 1: Code Cleanup
- Remove secrets, audit dependencies
- Clean git history if needed

### Week 2: Documentation
- README, CONTRIBUTING, LICENSE
- API docs and guides

### Week 3: Testing & CI
- Ensure all tests pass
- Set up GitHub Actions
- Security scanning

### Week 4: Soft Launch
- Make repository public
- Announce to small group
- Gather initial feedback

### Week 5: Public Announcement
- Blog post / Twitter thread
- Submit to relevant communities
- Link from FDG paper

---

## Post-Launch

- [ ] Monitor issues and discussions
- [ ] Respond to first contributions
- [ ] Create "good first issue" labels
- [ ] Consider roadmap.md for future plans
