#!/bin/bash
#
# GitHub Actions Self-Hosted Runner Security Validation Script
#
# This script validates security configuration of self-hosted runners
# according to the hardening checklist.
#
# Usage: sudo ./validate-runner.sh
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more critical checks failed
#   2 - One or more warnings (non-critical)

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root (sudo)${NC}"
   exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}GitHub Actions Runner Security Validation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to print check results
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# Section: System Configuration
echo -e "\n${BLUE}[System Configuration]${NC}"

# Check OS version
if grep -q "Ubuntu 22.04\|Ubuntu 24.04" /etc/os-release; then
    check_pass "OS: Ubuntu LTS version detected"
else
    check_warn "OS: Not running Ubuntu 22.04/24.04 LTS"
fi

# Check system updates
if [ $(apt list --upgradable 2>/dev/null | grep -c "upgradable") -eq 0 ]; then
    check_pass "System: All packages up to date"
else
    check_fail "System: Security updates available - run 'apt update && apt upgrade'"
fi

# Check unattended-upgrades
if systemctl is-enabled unattended-upgrades &>/dev/null; then
    check_pass "Auto-updates: Enabled"
else
    check_warn "Auto-updates: Not enabled - consider enabling unattended-upgrades"
fi

# Section: User Configuration
echo -e "\n${BLUE}[User Configuration]${NC}"

# Check runner user exists
if id actions-runner &>/dev/null; then
    check_pass "Runner user: 'actions-runner' exists"

    # Check user is not in sudo/admin groups
    if groups actions-runner | grep -qE "sudo|admin"; then
        check_fail "Runner user: Has sudo/admin privileges (SECURITY RISK)"
    else
        check_pass "Runner user: No sudo privileges"
    fi

    # Check home directory permissions
    HOME_PERMS=$(stat -c %a /home/actions-runner)
    if [ "$HOME_PERMS" = "700" ]; then
        check_pass "Runner home: Permissions are 700 (secure)"
    else
        check_fail "Runner home: Permissions are $HOME_PERMS (should be 700)"
    fi
else
    check_fail "Runner user: 'actions-runner' does not exist"
fi

# Section: Network Security
echo -e "\n${BLUE}[Network Security]${NC}"

# Check firewall status
if ufw status | grep -q "Status: active"; then
    check_pass "Firewall: UFW is active"

    # Check default policies
    if ufw status verbose | grep -q "Default: deny (incoming)"; then
        check_pass "Firewall: Default deny incoming"
    else
        check_fail "Firewall: Not configured to deny incoming by default"
    fi
else
    check_fail "Firewall: UFW is not active"
fi

# Section: SSH Hardening
echo -e "\n${BLUE}[SSH Configuration]${NC}"

if systemctl is-active sshd &>/dev/null || systemctl is-active ssh &>/dev/null; then
    # Check root login disabled
    if grep -q "^PermitRootLogin no" /etc/ssh/sshd_config; then
        check_pass "SSH: Root login disabled"
    else
        check_warn "SSH: Root login may be enabled"
    fi

    # Check password authentication disabled
    if grep -q "^PasswordAuthentication no" /etc/ssh/sshd_config; then
        check_pass "SSH: Password authentication disabled"
    else
        check_warn "SSH: Password authentication may be enabled"
    fi
else
    check_pass "SSH: Service not running (good for isolated runners)"
fi

# Section: Kernel Hardening
echo -e "\n${BLUE}[Kernel Hardening]${NC}"

# Check ASLR
ASLR=$(sysctl kernel.randomize_va_space | awk '{print $3}')
if [ "$ASLR" = "2" ]; then
    check_pass "Kernel: ASLR fully enabled"
else
    check_fail "Kernel: ASLR not fully enabled (value: $ASLR, should be 2)"
fi

# Check core dumps disabled
SUID_DUMP=$(sysctl fs.suid_dumpable | awk '{print $3}')
if [ "$SUID_DUMP" = "0" ]; then
    check_pass "Kernel: SUID core dumps disabled"
else
    check_warn "Kernel: SUID core dumps not disabled (value: $SUID_DUMP)"
fi

# Section: Audit Logging
echo -e "\n${BLUE}[Audit Logging]${NC}"

# Check auditd
if systemctl is-active auditd &>/dev/null; then
    check_pass "Audit: auditd service is running"

    # Check for runner-specific audit rules
    if auditctl -l | grep -q "actions-runner"; then
        check_pass "Audit: Runner-specific rules configured"
    else
        check_warn "Audit: No runner-specific audit rules found"
    fi
else
    check_warn "Audit: auditd service not running"
fi

# Section: Runner Installation
echo -e "\n${BLUE}[GitHub Actions Runner]${NC}"

# Check runner service
RUNNER_SERVICE=$(systemctl list-units --type=service --all | grep "actions.runner" | awk '{print $1}' | head -1)

if [ -n "$RUNNER_SERVICE" ]; then
    check_pass "Runner: Service found ($RUNNER_SERVICE)"

    # Check service is running
    if systemctl is-active "$RUNNER_SERVICE" &>/dev/null; then
        check_pass "Runner: Service is active"
    else
        check_warn "Runner: Service is not active"
    fi

    # Check service runs as actions-runner user
    SERVICE_USER=$(systemctl show "$RUNNER_SERVICE" -p User | cut -d= -f2)
    if [ "$SERVICE_USER" = "actions-runner" ]; then
        check_pass "Runner: Service runs as 'actions-runner' user"
    else
        check_fail "Runner: Service runs as '$SERVICE_USER' (should be 'actions-runner')"
    fi
else
    check_fail "Runner: No GitHub Actions runner service found"
fi

# Check credentials file permissions
if [ -f /home/actions-runner/.credentials ]; then
    CRED_PERMS=$(stat -c %a /home/actions-runner/.credentials)
    if [ "$CRED_PERMS" = "600" ]; then
        check_pass "Runner: Credentials file permissions secure (600)"
    else
        check_fail "Runner: Credentials file permissions are $CRED_PERMS (should be 600)"
    fi
fi

# Check work directory permissions
if [ -d /home/actions-runner/_work ]; then
    WORK_PERMS=$(stat -c %a /home/actions-runner/_work)
    if [ "$WORK_PERMS" = "700" ]; then
        check_pass "Runner: Work directory permissions secure (700)"
    else
        check_warn "Runner: Work directory permissions are $WORK_PERMS (should be 700)"
    fi
fi

# Section: Container Runtime
echo -e "\n${BLUE}[Container Runtime]${NC}"

# Check for Docker
if command -v docker &>/dev/null; then
    check_pass "Docker: Installed"

    # Check if actions-runner is in docker group
    if groups actions-runner | grep -q docker; then
        check_warn "Docker: Runner user in docker group (grants root-equivalent access)"
    fi

    # Check for rootless docker
    if [ -f /etc/docker/daemon.json ]; then
        if grep -q "userns-remap" /etc/docker/daemon.json; then
            check_pass "Docker: User namespace remapping configured"
        else
            check_warn "Docker: User namespace remapping not configured"
        fi
    fi
fi

# Check for Podman (rootless alternative)
if command -v podman &>/dev/null; then
    check_pass "Podman: Installed (rootless container runtime)"
fi

# Section: File Integrity Monitoring
echo -e "\n${BLUE}[File Integrity Monitoring]${NC}"

if command -v aide &>/dev/null; then
    check_pass "AIDE: Installed"

    if [ -f /var/lib/aide/aide.db ]; then
        check_pass "AIDE: Database initialized"
    else
        check_warn "AIDE: Database not initialized - run 'aideinit'"
    fi
else
    check_warn "AIDE: Not installed (recommended for file integrity monitoring)"
fi

# Section: Resource Limits
echo -e "\n${BLUE}[Resource Limits]${NC}"

# Check disk space
DISK_USAGE=$(df -h /home/actions-runner | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    check_pass "Disk: Usage at ${DISK_USAGE}% (healthy)"
else
    check_warn "Disk: Usage at ${DISK_USAGE}% (consider cleanup)"
fi

# Check memory
TOTAL_MEM=$(free -g | awk '/^Mem:/ {print $2}')
if [ "$TOTAL_MEM" -ge 4 ]; then
    check_pass "Memory: ${TOTAL_MEM}GB available (adequate)"
else
    check_warn "Memory: Only ${TOTAL_MEM}GB available (may be insufficient)"
fi

# Section: Security Tools
echo -e "\n${BLUE}[Security Tools]${NC}"

# Check for Lynis
if command -v lynis &>/dev/null; then
    check_pass "Lynis: Installed (security audit tool)"
else
    check_warn "Lynis: Not installed (recommended: 'apt install lynis')"
fi

# Check for fail2ban
if systemctl is-active fail2ban &>/dev/null; then
    check_pass "Fail2ban: Active (brute force protection)"
else
    check_warn "Fail2ban: Not active (recommended for SSH protection)"
fi

# Print Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Validation Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Passed:   $PASSED${NC}"
echo -e "${RED}Failed:   $FAILED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo ""

# Calculate score
TOTAL=$((PASSED + FAILED + WARNINGS))
SCORE=$((PASSED * 100 / TOTAL))

echo -e "Security Score: ${SCORE}%"

if [ $SCORE -ge 90 ]; then
    echo -e "${GREEN}Excellent security posture!${NC}"
elif [ $SCORE -ge 75 ]; then
    echo -e "${YELLOW}Good security posture, but room for improvement${NC}"
elif [ $SCORE -ge 60 ]; then
    echo -e "${YELLOW}Moderate security posture, improvements recommended${NC}"
else
    echo -e "${RED}Poor security posture, immediate improvements required${NC}"
fi

echo ""

# Exit with appropriate code
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Critical issues found. Please address failed checks.${NC}"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}Some warnings present. Review and address as needed.${NC}"
    exit 2
else
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
fi
