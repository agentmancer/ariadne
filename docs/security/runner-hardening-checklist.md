# Self-Hosted Runner Hardening Checklist

## Overview

This checklist provides a systematic approach to securing self-hosted GitHub Actions runners for the Sherlock platform.

## Pre-Installation Checklist

### Host System Requirements

- [ ] **Fresh Installation**: Use a clean OS installation, not an existing development machine
- [ ] **Supported OS**: Ubuntu 22.04 LTS or later (or approved alternative)
- [ ] **Dedicated Purpose**: Host runs only GitHub Actions runner, no other services
- [ ] **Network Access**: Host has restricted network access
- [ ] **Resource Allocation**: Adequate CPU, memory, and disk for expected workloads

### Network Configuration

- [ ] **Firewall Enabled**: UFW or iptables configured and active
- [ ] **Outbound Only**: No inbound connections allowed (except SSH if remote)
- [ ] **Egress Filtering**: Whitelist known-good domains (github.com, api.github.com, etc.)
- [ ] **DNS Security**: Use secure DNS resolver (1.1.1.1, 8.8.8.8, or internal)
- [ ] **No Public IP**: Runner behind NAT or private network if possible

### User Configuration

- [ ] **Dedicated User**: Create non-root user for runner (e.g., `actions-runner`)
- [ ] **No Password Login**: Disable password, use SSH keys only (if remote access needed)
- [ ] **Limited Sudo**: Runner user has NO sudo privileges
- [ ] **Home Directory Permissions**: Set to 700 (drwx------)
- [ ] **Shell Restrictions**: Consider restricted shell for runner user

## Installation Checklist

### System Hardening

- [ ] **Update System**: Apply all OS security updates
  ```bash
  sudo apt update && sudo apt upgrade -y
  ```

- [ ] **Automatic Updates**: Enable unattended-upgrades for security patches
  ```bash
  sudo apt install unattended-upgrades -y
  sudo dpkg-reconfigure -plow unattended-upgrades
  ```

- [ ] **Remove Unnecessary Packages**: Uninstall unused software
  ```bash
  sudo apt autoremove -y
  ```

- [ ] **Disable Unnecessary Services**: Stop and disable unused services
  ```bash
  sudo systemctl list-unit-files --type=service --state=enabled
  # Disable any unnecessary services
  ```

### Kernel Hardening

- [ ] **Enable ASLR**: Address Space Layout Randomization
  ```bash
  sudo sysctl -w kernel.randomize_va_space=2
  echo "kernel.randomize_va_space=2" | sudo tee -a /etc/sysctl.conf
  ```

- [ ] **Disable Core Dumps**: Prevent memory dumps
  ```bash
  echo "* hard core 0" | sudo tee -a /etc/security/limits.conf
  echo "fs.suid_dumpable=0" | sudo tee -a /etc/sysctl.conf
  sudo sysctl -p
  ```

- [ ] **Kernel Module Protection**: Restrict kernel module loading
  ```bash
  echo "kernel.modules_disabled=1" | sudo tee -a /etc/sysctl.conf
  # Note: Apply this only after all required modules are loaded
  ```

### Firewall Configuration

- [ ] **Enable UFW**: Uncomplicated Firewall
  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  # If SSH access needed:
  # sudo ufw allow from <trusted-ip> to any port 22
  sudo ufw enable
  ```

- [ ] **Rate Limiting**: Protect SSH from brute force
  ```bash
  sudo ufw limit ssh
  ```

- [ ] **Logging**: Enable firewall logging
  ```bash
  sudo ufw logging on
  ```

### Audit Logging

- [ ] **Install auditd**: Linux audit framework
  ```bash
  sudo apt install auditd audispd-plugins -y
  sudo systemctl enable auditd
  sudo systemctl start auditd
  ```

- [ ] **Audit Rules**: Monitor sensitive operations
  ```bash
  # Add to /etc/audit/rules.d/github-runner.rules
  -w /home/actions-runner/_work -p wa -k runner-workspace
  -w /home/actions-runner/.credentials -p wa -k runner-credentials
  -w /etc/passwd -p wa -k user-modification
  -w /etc/sudoers -p wa -k sudoers-modification
  ```

- [ ] **Restart auditd**: Apply new rules
  ```bash
  sudo service auditd restart
  ```

### SSH Hardening (if remote access needed)

- [ ] **Disable Root Login**: Edit /etc/ssh/sshd_config
  ```
  PermitRootLogin no
  ```

- [ ] **Disable Password Authentication**: Use keys only
  ```
  PasswordAuthentication no
  PubkeyAuthentication yes
  ```

- [ ] **Limit Users**: Restrict which users can SSH
  ```
  AllowUsers admin-user
  DenyUsers actions-runner
  ```

- [ ] **Change Default Port**: Use non-standard port (optional)
  ```
  Port 2222
  ```

- [ ] **Restart SSH**: Apply changes
  ```bash
  sudo systemctl restart sshd
  ```

## Runner Installation Checklist

### GitHub Actions Runner Setup

- [ ] **Create Runner User**
  ```bash
  sudo useradd -m -s /bin/bash actions-runner
  sudo chmod 700 /home/actions-runner
  ```

- [ ] **Download Runner**: Get official release
  ```bash
  sudo su - actions-runner
  mkdir actions-runner && cd actions-runner
  curl -o actions-runner-linux-x64-2.311.0.tar.gz -L \
    https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
  ```

- [ ] **Verify Checksum**: Ensure integrity
  ```bash
  echo "29fc8cf2dab4c195bb147384e7e2c94cfd4d4022c793b346a6175435265aa278  actions-runner-linux-x64-2.311.0.tar.gz" | shasum -a 256 -c
  ```

- [ ] **Extract Runner**
  ```bash
  tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz
  ```

- [ ] **Configure Runner**: Register with GitHub
  ```bash
  ./config.sh --url https://github.com/my-symbiotic-ai/sherlock --token [REGISTRATION_TOKEN]
  ```

- [ ] **Install Service**: Run as systemd service
  ```bash
  sudo ./svc.sh install actions-runner
  sudo ./svc.sh start
  ```

### Runner Configuration Security

- [ ] **Service Runs as Non-Root**: Verify service user
  ```bash
  systemctl show actions.runner.*.service | grep User=
  ```

- [ ] **Credentials Protected**: Verify .credentials file permissions
  ```bash
  ls -la /home/actions-runner/.credentials
  # Should be -rw------- (600)
  ```

- [ ] **Work Directory Isolated**: Check workspace permissions
  ```bash
  ls -la /home/actions-runner/_work
  # Should be drwx------ (700)
  ```

- [ ] **No Sudo Access**: Verify runner user cannot sudo
  ```bash
  sudo -l -U actions-runner
  # Should show "User actions-runner is not allowed to run sudo"
  ```

## Container Isolation (Recommended)

### Docker Installation

- [ ] **Install Docker**: If using container isolation
  ```bash
  sudo apt install docker.io -y
  sudo systemctl enable docker
  sudo systemctl start docker
  ```

- [ ] **Docker User Group**: Add runner user (with caution)
  ```bash
  # WARNING: Docker group grants root-equivalent access
  # Consider rootless Docker or podman as alternatives
  sudo usermod -aG docker actions-runner
  ```

- [ ] **Docker Security**: Configure daemon securely
  ```bash
  # Edit /etc/docker/daemon.json
  {
    "userns-remap": "default",
    "no-new-privileges": true,
    "icc": false,
    "live-restore": true
  }
  sudo systemctl restart docker
  ```

### Alternative: Podman (Rootless)

- [ ] **Install Podman**: Rootless alternative to Docker
  ```bash
  sudo apt install podman -y
  ```

- [ ] **Configure for Runner User**: Setup rootless containers
  ```bash
  sudo su - actions-runner
  podman info
  # Verify rootless configuration
  ```

## Monitoring and Alerting

### Log Configuration

- [ ] **Centralized Logging**: Ship logs to SIEM (optional)
  ```bash
  # Configure syslog forwarding or install log shipper
  ```

- [ ] **Log Rotation**: Prevent disk fill
  ```bash
  # Verify logrotate configured for runner logs
  cat /etc/logrotate.d/github-runner
  ```

- [ ] **Retention Policy**: Set appropriate log retention
  ```bash
  # Keep logs for minimum 90 days
  ```

### Resource Monitoring

- [ ] **Install Monitoring Agent**: For resource tracking
  ```bash
  # Install node_exporter, prometheus agent, or similar
  ```

- [ ] **Set Resource Alerts**: Alert on anomalies
  - CPU usage > 90% for > 5 minutes
  - Memory usage > 90%
  - Disk usage > 80%
  - Unusual network traffic patterns

### Security Monitoring

- [ ] **File Integrity Monitoring**: Detect unauthorized changes
  ```bash
  sudo apt install aide -y
  sudo aideinit
  sudo cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db
  ```

- [ ] **Intrusion Detection**: Install HIDS (optional)
  ```bash
  # Consider OSSEC, Wazuh, or similar
  ```

## Ongoing Maintenance Checklist

### Daily

- [ ] **Review Workflow Logs**: Check for anomalies
- [ ] **Monitor Resource Usage**: Verify normal operation
- [ ] **Check Service Status**: Ensure runner is running

### Weekly

- [ ] **Review Audit Logs**: Check auditd logs for suspicious activity
- [ ] **Check Disk Space**: Verify adequate space available
- [ ] **Review Firewall Logs**: Analyze blocked connections

### Monthly

- [ ] **Update Runner**: Check for new runner releases
- [ ] **Update Dependencies**: Update system packages
- [ ] **Review Access**: Audit who has access to runner host
- [ ] **Test Backup/Restore**: Verify runner can be rebuilt

### Quarterly

- [ ] **Security Assessment**: Review hardening measures
- [ ] **Penetration Test**: Consider security testing
- [ ] **Incident Response Drill**: Test response procedures
- [ ] **Documentation Review**: Update procedures and checklists

## Emergency Procedures

### Runner Compromise Suspected

1. **Immediate**: Stop runner service
   ```bash
   sudo systemctl stop actions.runner.*.service
   ```

2. **Immediate**: Disconnect from network
   ```bash
   sudo ip link set eth0 down
   ```

3. **Immediate**: Revoke runner registration
   ```bash
   # Remove runner from GitHub org/repo settings
   ```

4. **Within 1 hour**: Capture forensic image
   ```bash
   sudo dd if=/dev/sda of=/mnt/external/forensic-image.dd bs=4M
   ```

5. **Within 4 hours**: Rebuild runner from clean image
6. **Within 24 hours**: Complete incident investigation

See [Incident Response Procedures](./incident-response.md) for detailed steps.

## Compliance and Validation

### Validation Tools

- [ ] **OpenSCAP**: Automated compliance checking
  ```bash
  sudo apt install libopenscap8 -y
  oscap xccdf eval --profile xccdf_org.ssgproject.content_profile_standard \
    /usr/share/xml/scap/ssg/content/ssg-ubuntu2204-ds.xml
  ```

- [ ] **Lynis**: Security audit tool
  ```bash
  sudo apt install lynis -y
  sudo lynis audit system
  ```

- [ ] **Custom Validation Script**: Run automated checks
  ```bash
  # See docs/security/validate-runner.sh
  ```

### Security Score Target

Aim for:
- Lynis hardening index: > 75
- OpenSCAP compliance: > 90%
- Zero critical/high vulnerabilities

## Additional Resources

- [Self-Hosted Runner Security Best Practices](./self-hosted-runners.md)
- [Secret Rotation Procedures](./secret-rotation.md)
- [Incident Response Procedures](./incident-response.md)
- [CIS Ubuntu Linux Benchmark](https://www.cisecurity.org/benchmark/ubuntu_linux)
- [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)

## Checklist Completion

Date Completed: _______________
Completed By: _______________
Reviewed By: _______________
Next Review Date: _______________

**Notes:**
