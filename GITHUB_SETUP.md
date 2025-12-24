# GitHub Setup Instructions

## Step 1: Create the Repository on GitHub

1. Go to https://github.com/my-symbiotic-ai
2. Click "New repository" (or go to https://github.com/new)
3. Configure the repository:
   - **Owner**: my-symbiotic-ai
   - **Repository name**: ariadne
   - **Description**: Interactive storytelling research platform v2.0
   - **Visibility**: ✅ Private
   - **Do NOT initialize** with README, .gitignore, or license (we already have these)
4. Click "Create repository"

## Step 2: Push Your Code

Once the repository is created, run:

```bash
cd /home/john/ariadne
git push -u origin main
```

This will push both commits:
- Initial foundation commit
- Mobile web dashboard + roadmap commit

## Step 3: Verify the Push

Check that all files are visible on GitHub:
- https://github.com/my-symbiotic-ai/ariadne

You should see:
- 6 packages (api, desktop, mobile-web, web, shared, plugins)
- Documentation files (README.md, ROADMAP.md, etc.)
- 2 commits

## Step 4: Create GitHub Issues

Once the repository is pushed, you can create issues using the `gh` CLI:

```bash
# Make sure gh CLI is authenticated
gh auth status

# If not authenticated:
gh auth login

# Create issues from the prepared file
cd /home/john/ariadne
gh issue create --title "Milestone 2.1: Desktop Application UI" --body-file .github/issues/milestone-2-1.md --label "milestone,phase-2"

# Or create them manually via the web interface:
# https://github.com/my-symbiotic-ai/ariadne/issues/new
```

## Step 5: Set Up Project Board (Optional)

Create a GitHub Project board to track milestones:

1. Go to https://github.com/orgs/my-symbiotic-ai/projects (or your personal projects)
2. Click "New project"
3. Choose "Board" template
4. Name it "Ariadne v2.0 Development"
5. Add custom fields:
   - Phase (select: Phase 2, Phase 3, etc.)
   - Priority (select: High, Medium, Low)
   - Milestone (text)
6. Link issues to the project board

## Alternative: Using gh CLI

If you have `gh` CLI installed and authenticated:

```bash
# Check if gh is installed
gh --version

# Check authentication status
gh auth status

# Create repository (if not created via web)
gh repo create my-symbiotic-ai/ariadne --private --description "Interactive storytelling research platform v2.0"

# Push code
git push -u origin main

# Create all issues from prepared files
cd /home/john/ariadne/.github/issues
for file in *.md; do
  title=$(head -n 1 "$file" | sed 's/^# //')
  gh issue create --title "$title" --body-file "$file" --label "milestone"
done
```

## Troubleshooting

### SSH Key Not Recognized

If you get "Permission denied (publickey)":

```bash
# Check which SSH keys are loaded
ssh-add -l

# Add your key if needed
ssh-add ~/.ssh/id_ed25519_symbioticai_manager

# Test GitHub connection
ssh -T git@github.com
```

### Using HTTPS Instead of SSH

If you prefer HTTPS with a Personal Access Token:

```bash
# Change remote to HTTPS
git remote set-url origin https://github.com/my-symbiotic-ai/ariadne.git

# Push (will prompt for username and token)
git push -u origin main
```

Create a Personal Access Token at:
https://github.com/settings/tokens/new

Required scopes:
- `repo` (full control of private repositories)
- `workflow` (if using GitHub Actions)

---

**Next**: After pushing, see `GITHUB_ISSUES.md` for issue templates to create.
