/**
 * Azure Function: POST /api/suggest
 * 
 * Receives a link suggestion from the site form and creates a GitHub Issue.
 * Partners never need to interact with GitHub directly.
 */
module.exports = async function (context, req) {
  const { url, description, name } = req.body || {};

  if (!url) {
    context.res = { status: 400, body: { error: 'URL is required' } };
    return;
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME = process.env.REPO_NAME;
  const LIBRARY_NAME = process.env.LIBRARY_NAME || 'this library';

  if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
    context.log.error('Missing required env vars: GITHUB_TOKEN, REPO_OWNER, REPO_NAME');
    context.res = { status: 500, body: { error: 'Server configuration error' } };
    return;
  }

  // Build the Issue body
  const submitter = name || 'Anonymous';
  const issueTitle = `📋 Review content: ${(description || url).substring(0, 60)}`;
  const issueBody = [
    `## New link suggested for ${LIBRARY_NAME}`,
    ``,
    `🔗 **Suggested link:** ${url}`,
    ``,
    `**Description:** ${description || 'No description provided'}`,
    `**Submitted by:** ${submitter}`,
    ``,
    `---`,
    `*Submitted via the library website.*`,
  ].join('\n');

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github+json',
        },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: ['link-suggestion'],
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      context.log.error('GitHub API error:', err);
      context.res = { status: 500, body: { error: 'Failed to submit suggestion' } };
      return;
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { success: true, message: 'Thank you! Your suggestion has been submitted for review.' },
    };
  } catch (err) {
    context.log.error('Error creating issue:', err);
    context.res = { status: 500, body: { error: 'Failed to submit suggestion' } };
  }
};
