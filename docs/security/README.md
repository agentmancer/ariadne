# Sherlock Platform Security Documentation

## Overview

This directory contains comprehensive security documentation for the Sherlock platform, with a focus on GitHub Actions workflow security and self-hosted runner management.

## Purpose

These documents support the security requirements outlined in **RFC-001: Symbiote-Sherlock Integration Architecture** and provide operational procedures for maintaining a secure CI/CD infrastructure.

## Documentation Structure

### Core Security Guides

1. **[Self-Hosted Runner Security Best Practices](./self-hosted-runners.md)**
   - Comprehensive guide to securing GitHub Actions runners
   - Covers isolation, secret management, permissions, and monitoring
   - Includes threat model and defense-in-depth strategies
   - **When to use**: Before setting up new runners, during security reviews

2. **[Secret Rotation Procedures](./secret-rotation.md)**
   - Detailed procedures for rotating credentials and secrets
   - Includes rotation schedules and emergency procedures
   - Covers GitHub App keys, API tokens, and database credentials
   - **When to use**: Scheduled rotations, security incidents, personnel changes

3. **[Incident Response Procedures](./incident-response.md)**
   - Step-by-step incident response playbook
   - Covers detection, containment, eradication, and recovery
   - Includes specific scenarios and communication templates
   - **When to use**: Security incidents, suspected compromises, emergencies

### Operational Checklists

4. **[Runner Hardening Checklist](./runner-hardening-checklist.md)**
   - Pre-installation, installation, and ongoing maintenance checklists
   - Systematic approach to securing runner hosts
   - Includes compliance validation and emergency procedures
   - **When to use**: Setting up new runners, security audits, compliance checks

5. **[Runner Validation Script](./validate-runner.sh)**
   - Automated security validation script
   - Checks system configuration, user permissions, network security
   - Provides security score and actionable recommendations
   - **When to use**: After setup, during maintenance, before audits

## Quick Start

### For New Runner Setup

1. Review [Runner Hardening Checklist](./runner-hardening-checklist.md)
2. Follow pre-installation and installation checklists
3. Run validation script: `sudo ./validate-runner.sh`
4. Review [Self-Hosted Runner Security Best Practices](./self-hosted-runners.md)
5. Set up monitoring per recommendations

### For Security Incident

1. Immediately consult [Incident Response Procedures](./incident-response.md)
2. Follow appropriate scenario playbook
3. Execute containment steps
4. Notify incident commander
5. Document all actions

### For Routine Maintenance

1. Run weekly: `sudo ./validate-runner.sh`
2. Review monthly: Secret rotation schedule
3. Review quarterly: All security documentation
4. Update annually: Incident response procedures

## Security Principles

### Defense in Depth

Our security approach uses multiple layers:

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

### Least Privilege

- Workflows run with minimum required permissions
- Runner users have no sudo access
- Secrets scoped to specific repositories when possible
- Network access restricted to essential services

### Continuous Monitoring

- Audit logging for all security-relevant events
- Resource monitoring for anomaly detection
- Workflow execution tracking
- Secret access auditing

## Current Security Posture

### Implemented Controls

- ✅ Self-hosted runners on private repositories only
- ✅ Workflow permissions restricted to read/write specific resources
- ✅ GitHub App authentication with scoped tokens
- ✅ Timeout controls on workflow execution
- ✅ Secret scanning in PRs (via workflow)
- ✅ Workflow file validation (via actionlint)
- ✅ Input validation and injection prevention
- ✅ Pinned action versions (commit SHAs)

### Planned Enhancements

See GitHub issues for tracking:
- Issue #22: Workflow security improvements (this PR)
- Issue #23: Data flow diagrams
- Issue #24: Statistical power analysis
- Issue #25: Comprehensive threat model

## Compliance and Standards

### Referenced Standards

- **CIS Benchmarks**: Ubuntu Linux and Docker hardening
- **OWASP Top 10 CI/CD**: CI/CD security risks
- **NIST Cybersecurity Framework**: Identify, Protect, Detect, Respond, Recover
- **NIST SP 800-63B**: Digital identity guidelines
- **GitHub Security Best Practices**: Official security hardening guides

### Audit Trail Requirements

All security events maintain:
- Timestamp (UTC)
- Actor (user or system)
- Action performed
- Resource affected
- Result (success/failure)

## Roles and Responsibilities

### Security Team

- Maintain security documentation
- Review workflow changes for security implications
- Conduct security assessments
- Respond to security incidents
- Approve runner installations

### Repository Owners

- Implement security best practices
- Rotate secrets per schedule
- Report security incidents
- Review audit logs
- Maintain runner hosts

### Incident Commander

- Declare and classify incidents
- Coordinate response activities
- Communicate with stakeholders
- Approve containment decisions

## Training and Awareness

### Required Training

All team members with repository access should review:
1. Self-Hosted Runner Security Best Practices
2. Secret Management Guidelines
3. Incident Reporting Procedures

### Periodic Reviews

- Quarterly: Review security documentation
- Annually: Incident response tabletop exercise
- As needed: Security incident post-mortems

## Tools and Resources

### Security Scanning Tools

- **TruffleHog**: Secret scanning in code
- **actionlint**: GitHub Actions workflow validation
- **Lynis**: Linux security audit
- **AIDE**: File integrity monitoring
- **auditd**: Linux audit framework

### Monitoring Tools

- **GitHub Audit Log**: Organization and repository events
- **Workflow Run Logs**: Execution history
- **System Logs**: Runner host events
- **Resource Monitors**: CPU, memory, disk, network

## Emergency Contacts

See [Incident Response Procedures](./incident-response.md) for current contact information.

**Security Team Email**: [TODO: Add security team email]
**Incident Commander**: [TODO: Add incident commander contact]

## Updates and Maintenance

### Document Ownership

- **Owner**: Security Team
- **Reviewed By**: Repository Owners
- **Approved By**: Organization Admin

### Review Schedule

- **Routine Review**: Quarterly
- **After Incidents**: Within 7 days of resolution
- **After Major Changes**: Before deployment

### Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2024-11-22 | Initial security documentation | Claude Code |

### Changelog

- **v1.0** (2024-11-22): Initial release
  - Self-hosted runner security guide
  - Secret rotation procedures
  - Incident response playbook
  - Runner hardening checklist
  - Automated validation script

## Contributing

When updating security documentation:

1. Create feature branch from `main`
2. Update relevant documents
3. Update version history in this README
4. Test any scripts or procedures
5. Submit PR with security team review
6. Deploy after approval

## Related Documentation

- [RFC-001: Symbiote-Sherlock Integration Architecture](../rfcs/001-symbiote-sherlock-integration.md)
- [GitHub Actions Workflows](../../.github/workflows/)
- [API Security Middleware](../../packages/api/src/middleware/)

## Support

For questions about security procedures:
1. Check this documentation first
2. Review referenced standards and guides
3. Contact security team via [TODO: Add contact method]
4. For emergencies, follow incident response procedures

## License

This security documentation is proprietary to the Sherlock platform.
Unauthorized distribution prohibited.

---

**Last Updated**: 2024-11-22
**Next Review**: 2025-02-22
