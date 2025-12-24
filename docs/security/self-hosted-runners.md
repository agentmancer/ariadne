# Self-Hosted Runner Security Best Practices

## Overview

This document outlines security best practices for managing self-hosted GitHub Actions runners used in the Sherlock platform and Symbiote integration.

## Critical Security Principles

### 1. Runner Isolation

**Never use self-hosted runners with public repositories** - Public repositories allow anyone to submit PRs that execute code on your runners, creating a severe security risk.

**Current Status**: All Sherlock repositories are private, mitigating this risk.

#### Recommended Isolation Measures

- **Container Isolation**: Run each job in an ephemeral container
  ```yaml
  jobs:
    my-job:
      runs-on: self-hosted
      container:
        image: node:20-alpine
        options: --user 1001
  ```

- **VM Isolation**: Use separate VMs or EC2 instances for runner execution
- **Network Segmentation**: Isolate runner networks from production systems
- **Resource Limits**: Implement CPU, memory, and disk quotas

### 2. Secret Management

#### Organization vs Repository Secrets

**Current Configuration**:
- `SYMBIOTE_BOT_APP_ID`: Organization secret (accessible to all private repos)
- `SYMBIOTE_BOT_PRIVATE_KEY`: Organization secret (accessible to all private repos)

#### Best Practices

1. **Least Privilege**: Only grant secrets to workflows that need them
2. **Scope Appropriately**: Use repository secrets for repo-specific credentials
3. **Rotate Regularly**: See [Secret Rotation Procedures](./secret-rotation.md)
4. **Audit Access**: Regularly review which workflows access which secrets

#### Secret Security in Workflows

```yaml
# ✅ Good: Secrets only exposed to specific steps
- name: Generate Token
  id: app-token
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.SYMBIOTE_BOT_APP_ID }}
    private-key: ${{ secrets.SYMBIOTE_BOT_PRIVATE_KEY }}

# ❌ Bad: Secrets in environment variables for entire job
env:
  PRIVATE_KEY: ${{ secrets.SYMBIOTE_BOT_PRIVATE_KEY }}
```

### 3. Workflow Permissions

Always use **minimum required permissions**:

```yaml
permissions:
  contents: read        # Read repository contents
  pull-requests: write  # Comment on PRs
  id-token: write      # Generate OIDC tokens
```

**Never use**:
- `permissions: write-all`
- `contents: write` unless absolutely necessary for commits
- `actions: write` unless managing workflows programmatically

### 4. Runner Access Control

#### File System Security

- **Dedicated User**: Run GitHub Actions runner as a non-root user
- **Directory Permissions**: Restrict `_work` directory to runner user only
- **Sensitive Data**: Never store API keys, credentials, or PII on runner filesystem
- **Cleanup**: Ensure workspace cleanup after each job

#### Network Security

- **Egress Filtering**: Restrict outbound connections to known-good domains
- **Ingress Blocking**: Runners should never accept inbound connections
- **DNS Security**: Use secure DNS resolution (DoT/DoH)
- **TLS Verification**: Enforce certificate validation for all HTTPS connections

### 5. Code Execution Safety

#### Current Workflow Analysis

The `claude-code-review.yml` workflow executes Claude CLI with restricted tools:

```yaml
--allowed-tools "Bash(gh issue view:*),Bash(gh pr comment:*),..."
```

**Security Considerations**:
- ✅ Uses `--dangerously-skip-permissions` but restricts to safe `gh` commands
- ✅ Implements timeout (15 minutes) to prevent hanging
- ✅ Uses `continue-on-error: true` to avoid blocking PRs on failure
- ✅ Validates Claude CLI exists before execution
- ⚠️ Review allowed tools regularly to ensure no privilege escalation

#### Recommended Safeguards

1. **Input Validation**: Sanitize all workflow inputs
   ```yaml
   on:
     workflow_dispatch:
       inputs:
         version:
           type: string
           required: true
           # Use regex pattern to validate
           pattern: '^v[0-9]+\.[0-9]+\.[0-9]+$'
   ```

2. **Script Injection Prevention**: Never use unvalidated inputs in shell commands
   ```yaml
   # ❌ Dangerous
   run: echo "Building ${{ github.event.pull_request.title }}"

   # ✅ Safe
   env:
     PR_TITLE: ${{ github.event.pull_request.title }}
   run: echo "Building ${PR_TITLE}"
   ```

3. **Dependency Pinning**: Pin all action versions to commit SHAs
   ```yaml
   # ✅ Good
   uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1

   # ⚠️ Less secure
   uses: actions/checkout@v4
   ```

### 6. Monitoring and Auditing

#### Required Monitoring

- **Workflow Execution Logs**: Retain for minimum 90 days
- **Secret Access Audit**: Track which workflows access secrets
- **Runner Resource Usage**: Monitor CPU, memory, disk, network
- **Failed Jobs**: Alert on unusual failure patterns
- **Execution Time**: Alert on jobs exceeding expected duration

#### Metrics to Track

```yaml
# Example monitoring metrics
- workflow_execution_duration_seconds
- workflow_execution_count{status="success|failure"}
- runner_cpu_usage_percent
- runner_memory_usage_bytes
- secret_access_count{secret_name}
```

### 7. Runner Maintenance

#### Update Schedule

- **GitHub Actions Runner**: Update within 7 days of release
- **Operating System**: Apply security patches within 48 hours
- **Dependencies**: Update claude CLI and other tools monthly
- **Docker Images**: Rebuild base images weekly

#### Hardening Checklist

- [ ] Disable unnecessary services on runner host
- [ ] Enable automatic security updates
- [ ] Configure firewall (ufw/iptables)
- [ ] Enable audit logging (auditd)
- [ ] Disable root SSH access
- [ ] Use SSH key authentication only
- [ ] Configure fail2ban for brute force protection
- [ ] Enable ASLR and other kernel hardening
- [ ] Remove unused packages and dependencies

## Threat Model

### Attack Vectors

1. **Malicious PR from Collaborator**: Mitigated by code review and restricted permissions
2. **Compromised Dependency**: Mitigated by dependency pinning and security scanning
3. **Secret Exfiltration**: Mitigated by secret scoping and audit logging
4. **Workflow Injection**: Mitigated by input validation and safe scripting
5. **Lateral Movement**: Mitigated by network segmentation and least privilege

### Defense in Depth

```
┌─────────────────────────────────────┐
│ Organization Boundary               │
│  ┌───────────────────────────────┐  │
│  │ Repository Access Control     │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │ Workflow Permissions    │  │  │
│  │  │  ┌───────────────────┐  │  │  │
│  │  │  │ Runner Isolation  │  │  │  │
│  │  │  │  ┌─────────────┐  │  │  │  │
│  │  │  │  │ Container   │  │  │  │  │
│  │  │  │  └─────────────┘  │  │  │  │
│  │  │  └───────────────────┘  │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Compliance and Standards

### Industry Standards

- **CIS GitHub Actions Benchmark**: Follow applicable controls
- **OWASP Top 10 CI/CD**: Address risks in CI/CD pipelines
- **NIST Cybersecurity Framework**: Align with Identify, Protect, Detect, Respond, Recover

### Organizational Policies

- All workflow changes must be reviewed by security team
- Critical workflows require two-person approval
- Production deployments require separate approval workflow
- Incident response procedures must be tested quarterly

## Quick Reference

### Pre-Deployment Checklist

- [ ] Runner uses dedicated non-root user
- [ ] Workflow uses minimum required permissions
- [ ] All actions pinned to commit SHA
- [ ] Secrets scoped appropriately (repo vs org)
- [ ] Input validation implemented for all user inputs
- [ ] Timeout configured for all jobs
- [ ] Error handling prevents secret leakage
- [ ] Monitoring and alerting configured
- [ ] Incident response procedures documented
- [ ] Security review completed

### Emergency Contacts

See [Incident Response Procedures](./incident-response.md) for emergency contacts and escalation procedures.

## References

- [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [Self-hosted Runner Security](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners#self-hosted-runner-security)
- [OWASP Top 10 CI/CD Security Risks](https://owasp.org/www-project-top-10-ci-cd-security-risks/)
- RFC-001: Symbiote-Sherlock Integration Architecture
