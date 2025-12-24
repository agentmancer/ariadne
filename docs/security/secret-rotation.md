# Secret Rotation Procedures

## Overview

This document defines procedures for rotating secrets used in GitHub Actions workflows to maintain security and limit the impact of potential compromises.

## Rotation Schedule

### Required Rotation Frequency

| Secret Type | Rotation Frequency | Trigger Events |
|------------|-------------------|----------------|
| GitHub App Private Keys | 90 days | Compromise, personnel change, security incident |
| API Tokens | 30 days | Compromise, personnel change |
| Database Credentials | 90 days | Compromise, personnel change, migration |
| Service Account Keys | 90 days | Compromise, personnel change |
| Signing Keys | 180 days | Compromise, algorithm deprecation |

### Emergency Rotation

Immediate rotation required when:
- Credential exposure in logs, code, or public channels
- Personnel with access leave organization
- Security incident or breach suspected
- Compliance violation detected
- Automated security scan detects exposure

## Current Secrets Inventory

### Organization Secrets (my-symbiotic-ai)

1. **SYMBIOTE_BOT_APP_ID**
   - Type: GitHub App ID
   - Used By: All private repositories
   - Rotation: Not required (public identifier)
   - Last Rotated: N/A

2. **SYMBIOTE_BOT_PRIVATE_KEY**
   - Type: GitHub App Private Key
   - Used By: All private repositories
   - Rotation: 90 days
   - Last Rotated: [TODO: Track rotation date]
   - Next Rotation: [TODO: Calculate based on last rotation]

### Repository-Specific Secrets

Currently, all secrets are managed at organization level for consistency across repositories.

## Rotation Procedures

### GitHub App Private Key Rotation

#### Prerequisites

- [ ] Admin access to GitHub organization
- [ ] Access to GitHub App settings
- [ ] Communication plan for affected teams
- [ ] Testing environment to validate new key

#### Procedure

1. **Generate New Private Key**
   ```bash
   # Navigate to GitHub App settings
   # https://github.com/organizations/my-symbiotic-ai/settings/apps/[app-name]

   # Click "Generate a private key"
   # Download the new .pem file
   # Store securely in password manager
   ```

2. **Update Organization Secret**
   ```bash
   # Option 1: Via GitHub UI
   # Settings > Secrets and variables > Actions > Organization secrets
   # Edit SYMBIOTE_BOT_PRIVATE_KEY
   # Paste new private key content

   # Option 2: Via GitHub CLI
   gh secret set SYMBIOTE_BOT_PRIVATE_KEY --org my-symbiotic-ai < new-key.pem
   ```

3. **Validate New Key**
   ```bash
   # Trigger a test workflow run
   # Verify workflow can generate tokens successfully
   # Check workflow logs for authentication errors
   ```

4. **Monitor for Issues**
   - Watch workflow runs for 24 hours
   - Check error logs and alerts
   - Verify PR review automation still functions

5. **Revoke Old Private Key**
   ```bash
   # Only after confirming new key works
   # Navigate to GitHub App settings
   # Delete old private key
   # Document rotation in rotation log
   ```

6. **Update Documentation**
   - Update "Last Rotated" date in this document
   - Update "Next Rotation" date (current date + 90 days)
   - Note any issues encountered

#### Rollback Procedure

If issues occur with new key:

1. **Immediate Action**
   ```bash
   # Restore old private key to GitHub secrets
   gh secret set SYMBIOTE_BOT_PRIVATE_KEY --org my-symbiotic-ai < old-key.pem
   ```

2. **Verify Restoration**
   - Trigger test workflow
   - Confirm functionality restored

3. **Investigate Issues**
   - Review error logs
   - Check key format and encoding
   - Verify App permissions unchanged

### API Token Rotation

For third-party API tokens (if/when integrated):

1. **Generate New Token** in third-party service
2. **Test Token** in development environment
3. **Update GitHub Secret** with new token
4. **Validate** via test workflow run
5. **Revoke Old Token** after validation period
6. **Document** rotation in log

### Database Credential Rotation

For production database credentials:

1. **Create New Credentials** with same permissions
2. **Update Application Configuration** to use new credentials
3. **Deploy Configuration Update**
4. **Verify Connectivity** and application functionality
5. **Revoke Old Credentials** after grace period
6. **Update Secret** in GitHub if used by workflows

## Automation

### Future Enhancements

Consider implementing automated secret rotation:

```yaml
# .github/workflows/secret-rotation-reminder.yml
name: Secret Rotation Reminder

on:
  schedule:
    # Run weekly on Monday at 9 AM UTC
    - cron: '0 9 * * 1'

jobs:
  check-rotation-due:
    runs-on: ubuntu-latest
    steps:
      - name: Check GitHub App Key Age
        run: |
          # Compare current date with last rotation date
          # Send notification if rotation due within 14 days
          # Create GitHub issue for rotation task
```

### Rotation Tracking

Maintain a rotation log:

```yaml
# docs/security/rotation-log.yml
rotations:
  - secret: SYMBIOTE_BOT_PRIVATE_KEY
    date: 2024-12-15
    rotated_by: admin@example.com
    reason: Scheduled 90-day rotation
    issues: None

  - secret: SYMBIOTE_BOT_PRIVATE_KEY
    date: 2024-09-15
    rotated_by: admin@example.com
    reason: Scheduled 90-day rotation
    issues: None
```

## Secret Compromise Response

If a secret is compromised:

### Immediate Actions (0-1 hour)

1. **Revoke Compromised Secret**
   - Delete from GitHub organization secrets
   - Revoke API tokens, private keys immediately
   - Disable affected service accounts

2. **Assess Impact**
   - Review audit logs for unauthorized access
   - Check recent workflow runs for anomalies
   - Identify potentially affected systems

3. **Generate New Secret**
   - Follow rotation procedure for secret type
   - Use strong, unique credentials
   - Update in GitHub secrets immediately

### Short-Term Actions (1-24 hours)

4. **Audit Access**
   - Review all workflow runs during exposure window
   - Check for unauthorized actions or data access
   - Review repository access logs

5. **Notify Stakeholders**
   - Inform security team
   - Notify affected repository owners
   - Document incident details

6. **Strengthen Security**
   - Review and restrict secret scope if needed
   - Add additional monitoring
   - Update access controls

### Long-Term Actions (1-7 days)

7. **Root Cause Analysis**
   - Determine how secret was compromised
   - Identify security gaps
   - Document lessons learned

8. **Implement Preventive Measures**
   - Update security policies
   - Add secret scanning tools
   - Improve access controls
   - Enhance monitoring

9. **Post-Incident Review**
   - Conduct team review meeting
   - Update incident response procedures
   - Share learnings with organization

## Security Best Practices

### Secret Generation

- **Entropy**: Use cryptographically secure random generators
- **Length**: Minimum 32 characters for tokens
- **Complexity**: Mix uppercase, lowercase, numbers, symbols
- **Uniqueness**: Never reuse secrets across systems

### Secret Storage

- **GitHub Secrets**: Encrypted at rest, only exposed during workflow execution
- **Password Manager**: Use for team access to backup copies
- **Hardware Security Module (HSM)**: Consider for signing keys
- **Never**: Commit secrets to repository, store in logs, share via email/chat

### Secret Usage

- **Least Privilege**: Grant minimum required permissions
- **Scope Limitation**: Use repository secrets when possible vs organization
- **Temporal Limitation**: Use short-lived tokens when available
- **Monitoring**: Log and alert on secret usage patterns

## Validation and Testing

### Pre-Rotation Testing

Before rotating production secrets:

1. **Create Test Environment**
   - Mirror production configuration
   - Use test credentials
   - Isolate from production data

2. **Validate Rotation Process**
   - Execute rotation steps in test environment
   - Verify new credentials work
   - Test rollback procedure

3. **Document Test Results**
   - Record any issues encountered
   - Update procedures based on findings
   - Verify documentation accuracy

### Post-Rotation Validation

After rotating production secrets:

1. **Functionality Testing**
   - Trigger workflow runs
   - Verify PR reviews function correctly
   - Check API integrations

2. **Security Validation**
   - Confirm old credentials revoked
   - Verify new credentials properly scoped
   - Check audit logs for errors

3. **Performance Monitoring**
   - Monitor for authentication failures
   - Check workflow execution times
   - Review error rates

## Compliance and Audit

### Audit Trail Requirements

Maintain records of:
- Date and time of rotation
- Person who performed rotation
- Reason for rotation (scheduled vs emergency)
- Systems/workflows affected
- Issues encountered
- Validation results

### Compliance Checks

Quarterly review:
- [ ] All secrets rotated per schedule
- [ ] Rotation procedures tested and validated
- [ ] Audit logs complete and accurate
- [ ] No credential exposures detected
- [ ] Monitoring and alerting functional
- [ ] Incident response procedures current

## References

- [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Self-Hosted Runner Security](./self-hosted-runners.md)
- [Incident Response Procedures](./incident-response.md)
- [NIST SP 800-63B: Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)

## Appendix: Quick Reference

### Emergency Rotation Command

```bash
# Generate new GitHub App private key
# 1. Navigate to: https://github.com/organizations/my-symbiotic-ai/settings/apps
# 2. Click "Generate a private key"
# 3. Update secret:
gh secret set SYMBIOTE_BOT_PRIVATE_KEY --org my-symbiotic-ai < new-key.pem

# Validate with test workflow
gh workflow run claude-code-review.yml --repo my-symbiotic-ai/sherlock

# Monitor results
gh run list --workflow=claude-code-review.yml --repo my-symbiotic-ai/sherlock
```

### Rotation Checklist

- [ ] Review rotation schedule and identify due secrets
- [ ] Notify stakeholders of planned rotation
- [ ] Test rotation procedure in non-production environment
- [ ] Generate new credentials
- [ ] Update GitHub secrets
- [ ] Validate functionality with test runs
- [ ] Monitor for issues (24 hour window)
- [ ] Revoke old credentials
- [ ] Update rotation log
- [ ] Document any issues encountered
