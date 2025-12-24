# Incident Response Procedures for GitHub Actions Workflows

## Overview

This document outlines procedures for responding to security incidents involving GitHub Actions workflows, self-hosted runners, and the Symbiote-Sherlock integration.

## Incident Classification

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| **P0 - Critical** | Immediate threat to production systems or data | < 15 minutes | Active breach, credential exposure, data exfiltration |
| **P1 - High** | Significant security risk | < 1 hour | Workflow compromise, unauthorized access, failed security controls |
| **P2 - Medium** | Moderate security concern | < 4 hours | Configuration drift, suspicious activity, policy violations |
| **P3 - Low** | Minor security issue | < 24 hours | Documentation gaps, minor misconfigurations, potential vulnerabilities |

### Incident Types

1. **Credential Compromise**
   - GitHub App private key exposed
   - Organization secrets leaked
   - Runner access tokens stolen

2. **Unauthorized Access**
   - Unexpected workflow executions
   - Unauthorized repository access
   - Privilege escalation attempts

3. **Code Injection**
   - Malicious code in PR triggers
   - Workflow tampering
   - Dependency confusion attacks

4. **Data Breach**
   - Research data exfiltration
   - Participant information exposure
   - System metadata disclosure

5. **Availability Impact**
   - Runner resource exhaustion
   - Workflow DoS attacks
   - Service disruptions

6. **Supply Chain Compromise**
   - Malicious GitHub Action
   - Compromised dependency
   - Base image vulnerability

## Response Team

### Roles and Responsibilities

#### Incident Commander (IC)
- **Primary**: Repository owner / Organization admin
- **Responsibilities**:
  - Declare and classify incidents
  - Coordinate response activities
  - Make containment decisions
  - Communicate with stakeholders

#### Security Lead
- **Primary**: Security team lead
- **Responsibilities**:
  - Assess technical impact
  - Implement containment measures
  - Conduct forensic analysis
  - Recommend remediation

#### Communications Lead
- **Primary**: Project manager
- **Responsibilities**:
  - Internal stakeholder updates
  - External communications (if needed)
  - Incident documentation
  - Post-mortem coordination

### Contact Information

```yaml
# Store actual contact information securely
contacts:
  incident_commander:
    name: "[TODO: Add name]"
    email: "[TODO: Add email]"
    phone: "[TODO: Add phone]"
    backup: "[TODO: Add backup contact]"

  security_lead:
    name: "[TODO: Add name]"
    email: "[TODO: Add email]"
    phone: "[TODO: Add phone]"
    backup: "[TODO: Add backup contact]"

  communications_lead:
    name: "[TODO: Add name]"
    email: "[TODO: Add email]"
    phone: "[TODO: Add phone]"
    backup: "[TODO: Add backup contact]"
```

## Detection and Alerting

### Monitoring Points

1. **Workflow Execution**
   - Unexpected workflow triggers
   - Failed authentication attempts
   - Unusual execution patterns
   - Excessive resource usage

2. **Secret Access**
   - Secret access outside normal hours
   - High volume of secret retrievals
   - Access from unexpected workflows

3. **Runner Health**
   - CPU/memory/disk anomalies
   - Network connection spikes
   - Unexpected processes
   - File system changes

4. **Code Changes**
   - Workflow file modifications
   - Dependency updates
   - Action version changes
   - Configuration changes

### Alert Channels

- **GitHub Notifications**: Built-in security alerts
- **Email**: Critical alerts to response team
- **Slack/Discord**: Real-time team notifications (if configured)
- **Log Aggregation**: Centralized logging platform (if configured)

## Response Procedures

### Phase 1: Detection and Analysis (0-15 minutes)

#### Immediate Actions

1. **Confirm Incident**
   ```bash
   # Check recent workflow runs
   gh run list --limit 20 --repo my-symbiotic-ai/sherlock

   # View specific run details
   gh run view [run-id] --log

   # Check for unusual activity
   gh api /orgs/my-symbiotic-ai/audit-log
   ```

2. **Classify Severity**
   - Assess potential impact
   - Determine affected systems
   - Classify per severity matrix

3. **Activate Response Team**
   - Notify Incident Commander
   - Activate appropriate response level
   - Establish communication channel

4. **Preserve Evidence**
   ```bash
   # Capture current state before changes
   gh run list --json status,conclusion,name,createdAt > incident-runs.json
   gh api /orgs/my-symbiotic-ai/audit-log > incident-audit.json

   # Timestamp evidence collection
   date -u > incident-timestamp.txt
   ```

### Phase 2: Containment (15 minutes - 1 hour)

#### Short-Term Containment

1. **Disable Compromised Workflows**
   ```bash
   # Disable specific workflow
   gh workflow disable claude-code-review.yml --repo my-symbiotic-ai/sherlock

   # Or disable all workflows if needed
   # (requires manual action in GitHub UI or API calls)
   ```

2. **Revoke Compromised Credentials**
   ```bash
   # Remove organization secret immediately
   gh secret remove SYMBIOTE_BOT_PRIVATE_KEY --org my-symbiotic-ai

   # Revoke GitHub App private key in UI
   # https://github.com/organizations/my-symbiotic-ai/settings/apps
   ```

3. **Isolate Affected Runners**
   ```bash
   # Stop runner service on affected hosts
   sudo systemctl stop actions.runner.*

   # Disconnect from network if severe
   sudo ip link set eth0 down
   ```

4. **Block Malicious Actors**
   ```bash
   # Remove repository collaborator if needed
   gh api -X DELETE /repos/my-symbiotic-ai/sherlock/collaborators/[username]

   # Block organization user if needed
   gh api -X PUT /orgs/my-symbiotic-ai/blocks/[username]
   ```

#### Long-Term Containment

5. **Implement Enhanced Monitoring**
   - Increase logging verbosity
   - Add real-time alerting
   - Monitor for recurrence

6. **Restrict Access**
   - Reduce permissions to minimum
   - Require re-authentication
   - Implement additional reviews

7. **Update Security Controls**
   - Patch vulnerabilities
   - Update security policies
   - Strengthen authentication

### Phase 3: Eradication (1-4 hours)

#### Root Cause Analysis

1. **Identify Attack Vector**
   - Review logs and audit trails
   - Analyze workflow execution history
   - Check for indicators of compromise

2. **Determine Scope**
   ```bash
   # Search for similar patterns
   gh run list --workflow=claude-code-review.yml --json status,conclusion,createdAt

   # Check all affected repositories
   gh repo list my-symbiotic-ai --json name,updatedAt
   ```

3. **Remove Malicious Components**
   - Delete malicious workflow files
   - Remove compromised dependencies
   - Clean infected runners

#### Remediation Steps

4. **Restore Secure Configuration**
   ```bash
   # Revert workflow to known-good version
   git revert [malicious-commit]
   git push origin main

   # Or restore from backup
   git checkout [last-good-commit] -- .github/workflows/
   git commit -m "Restore workflows to secure state"
   git push origin main
   ```

5. **Rotate All Credentials**
   - Follow [Secret Rotation Procedures](./secret-rotation.md)
   - Update all potentially affected secrets
   - Generate new runner registration tokens

6. **Rebuild Compromised Runners**
   ```bash
   # Provision fresh runner instance
   # Re-install runner from official source
   # Apply hardening per security best practices
   # Re-register with GitHub
   ```

### Phase 4: Recovery (4-24 hours)

#### Service Restoration

1. **Validate Security Controls**
   - Test authentication mechanisms
   - Verify permission boundaries
   - Confirm monitoring operational

2. **Re-enable Workflows Gradually**
   ```bash
   # Re-enable workflows one at a time
   gh workflow enable claude-code-review.yml --repo my-symbiotic-ai/sherlock

   # Test with controlled PR
   gh pr create --title "Security validation test" --body "Testing workflow security"
   ```

3. **Monitor for Anomalies**
   - Watch first 24 hours closely
   - Review all workflow executions
   - Check for recurrence indicators

4. **Restore Normal Operations**
   - Remove temporary restrictions
   - Return to standard monitoring
   - Document any permanent changes

### Phase 5: Post-Incident Activities (1-7 days)

#### Documentation

1. **Incident Report**
   ```markdown
   # Incident Report: [Incident ID]

   ## Summary
   - Date/Time: [UTC timestamp]
   - Severity: [P0/P1/P2/P3]
   - Type: [Incident type]
   - Duration: [Time to resolution]

   ## Timeline
   - [HH:MM] Detection
   - [HH:MM] Containment
   - [HH:MM] Eradication
   - [HH:MM] Recovery

   ## Impact
   - Systems affected: [List]
   - Data accessed: [Yes/No/Unknown]
   - Downtime: [Duration]

   ## Root Cause
   [Detailed analysis]

   ## Actions Taken
   [Chronological list]

   ## Lessons Learned
   [Key takeaways]

   ## Follow-up Actions
   - [ ] Action item 1
   - [ ] Action item 2
   ```

2. **Post-Mortem Meeting**
   - Schedule within 48 hours
   - Include all response team members
   - Review timeline and decisions
   - Identify improvement opportunities

3. **Update Procedures**
   - Incorporate lessons learned
   - Update runbooks
   - Improve detection capabilities
   - Enhance prevention measures

#### Preventive Actions

4. **Implement Recommendations**
   - Address identified vulnerabilities
   - Strengthen security controls
   - Update monitoring and alerting
   - Conduct security training

5. **Test Improvements**
   - Validate new controls
   - Run tabletop exercises
   - Update incident response plan
   - Document changes

## Specific Incident Scenarios

### Scenario 1: Exposed GitHub App Private Key

**Detection**: Key found in logs, public repository, or external system

**Immediate Actions**:
1. Revoke key in GitHub App settings (< 5 minutes)
2. Remove from organization secrets (< 5 minutes)
3. Generate new key (< 5 minutes)
4. Update organization secret (< 5 minutes)

**Follow-up**:
- Review audit logs for unauthorized token generation
- Check all workflow runs during exposure window
- Notify affected repositories
- Document incident

### Scenario 2: Malicious PR Triggers Workflow

**Detection**: Unexpected workflow execution, suspicious PR activity

**Immediate Actions**:
1. Close and lock PR (< 2 minutes)
2. Disable workflow temporarily (< 2 minutes)
3. Review workflow logs for damage (< 10 minutes)
4. Check runner for compromise (< 15 minutes)

**Follow-up**:
- Block malicious user
- Review PR trigger conditions
- Enhance PR validation
- Update workflow permissions

### Scenario 3: Self-Hosted Runner Compromised

**Detection**: Unusual processes, network traffic, or resource usage

**Immediate Actions**:
1. Disconnect runner from network (< 1 minute)
2. Stop runner service (< 1 minute)
3. Disable workflows using runner (< 5 minutes)
4. Capture memory/disk images (< 30 minutes)

**Follow-up**:
- Forensic analysis of runner
- Rebuild from clean image
- Review all executions
- Strengthen isolation

### Scenario 4: Workflow Injection Attack

**Detection**: Workflow files modified unexpectedly, unusual permissions

**Immediate Actions**:
1. Revert workflow changes (< 5 minutes)
2. Review commit history (< 10 minutes)
3. Check for other modifications (< 15 minutes)
4. Assess executed actions (< 20 minutes)

**Follow-up**:
- Require branch protection
- Implement CODEOWNERS for workflows
- Add workflow validation
- Review access controls

### Scenario 5: Dependency Confusion Attack

**Detection**: Unexpected dependencies in workflow, unusual package installs

**Immediate Actions**:
1. Stop running workflows (< 2 minutes)
2. Identify malicious package (< 10 minutes)
3. Check for data exfiltration (< 15 minutes)
4. Remove from dependencies (< 5 minutes)

**Follow-up**:
- Pin all dependencies to specific versions
- Use private package registry
- Implement dependency scanning
- Review software supply chain

## Communication Templates

### Internal Notification

```
SECURITY INCIDENT ALERT

Severity: [P0/P1/P2/P3]
Type: [Incident type]
Status: [Detected/Contained/Resolved]

Summary: [Brief description]

Impact: [Systems/data affected]

Actions Required: [What team members should do]

Incident Commander: [Name and contact]

Next Update: [Time]
```

### External Notification (if required)

```
Security Notice

We are writing to inform you of a security incident involving our GitHub Actions infrastructure.

What Happened: [Brief description]

What Information Was Involved: [Data types]

What We Are Doing: [Response actions]

What You Can Do: [Recommendations]

Contact: [Support email/phone]
```

## Testing and Exercises

### Tabletop Exercises

Conduct quarterly exercises covering:
- Credential compromise scenario
- Workflow injection scenario
- Runner compromise scenario
- Multi-repository incident

### Procedure Validation

Annually validate:
- Contact information current
- Response tools functional
- Procedures accurate
- Team trained

### Continuous Improvement

After each incident:
- Update procedures based on learnings
- Enhance detection capabilities
- Strengthen prevention measures
- Share knowledge with team

## Compliance and Reporting

### Regulatory Requirements

Consider requirements for:
- Data breach notification laws
- Research ethics board reporting
- Institutional security policies
- Industry compliance standards

### Incident Metrics

Track and report:
- Mean time to detect (MTTD)
- Mean time to respond (MTTR)
- Mean time to recover (MTTR)
- Incident frequency and trends
- Control effectiveness

## References

- [Self-Hosted Runner Security](./self-hosted-runners.md)
- [Secret Rotation Procedures](./secret-rotation.md)
- [GitHub Security Best Practices](https://docs.github.com/en/code-security/getting-started/github-security-features)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [SANS Incident Handler's Handbook](https://www.sans.org/reading-room/whitepapers/incident/incident-handlers-handbook-33901)

## Quick Reference Card

### Emergency Disable Workflow
```bash
gh workflow disable [workflow-name] --repo [org/repo]
```

### Emergency Revoke Secret
```bash
gh secret remove [SECRET_NAME] --org [org-name]
```

### Emergency Stop Runner
```bash
sudo systemctl stop actions.runner.*
```

### View Recent Activity
```bash
gh run list --limit 20 --repo [org/repo]
gh api /orgs/[org]/audit-log
```

### Contact Incident Commander
```
Name: [TODO]
Email: [TODO]
Phone: [TODO]
```

---

**Document Version**: 1.0
**Last Updated**: [Current Date]
**Next Review**: [+90 days]
**Owner**: Security Team
