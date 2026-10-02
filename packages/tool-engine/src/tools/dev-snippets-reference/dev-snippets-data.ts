export type SnippetCategory =
  | 'HTTP Headers'
  | 'Regex Syntax'
  | 'Git'
  | 'Docker'
  | 'PowerShell'
  | 'Bash'
  | 'SQL'
  | 'CSS'
  | 'HTML'
  | 'Unicode'
  | 'MIME Types'
  | 'Cron'
  | 'chmod';

export interface SnippetEntry {
  readonly category: SnippetCategory;
  readonly title: string;
  readonly snippet: string;
  readonly description: string;
}

export const DEV_SNIPPETS: readonly SnippetEntry[] = [
  // HTTP Headers
  { category: 'HTTP Headers', title: 'Authorization: Bearer', snippet: 'Authorization: Bearer <token>', description: 'Sends an OAuth2/JWT bearer token for API authentication.' },
  { category: 'HTTP Headers', title: 'Content-Type: JSON', snippet: 'Content-Type: application/json', description: 'Declares a JSON request/response body.' },
  { category: 'HTTP Headers', title: 'Cache-Control: no-store', snippet: 'Cache-Control: no-store', description: 'Prevents any caching of the response, including in browser history.' },
  { category: 'HTTP Headers', title: 'CORS: allow all origins', snippet: 'Access-Control-Allow-Origin: *', description: 'Allows any origin to read the response — never combine with credentials.' },
  { category: 'HTTP Headers', title: 'ETag conditional request', snippet: 'If-None-Match: "<etag>"', description: 'Asks the server to return 304 Not Modified if the resource is unchanged.' },
  { category: 'HTTP Headers', title: 'Retry-After', snippet: 'Retry-After: 120', description: 'Tells the client how many seconds to wait before retrying (used with 429/503).' },
  { category: 'HTTP Headers', title: 'Strict-Transport-Security', snippet: 'Strict-Transport-Security: max-age=31536000; includeSubDomains', description: 'Forces HTTPS for the given max-age (seconds) on this host and subdomains.' },
  { category: 'HTTP Headers', title: 'X-Request-ID', snippet: 'X-Request-Id: <uuid>', description: 'Common convention for correlating a request across logs/services.' },

  // Regex Syntax
  { category: 'Regex Syntax', title: 'Named capture group', snippet: '(?<year>\\d{4})-(?<month>\\d{2})', description: 'Captures a group addressable by name instead of index.' },
  { category: 'Regex Syntax', title: 'Non-capturing group', snippet: '(?:abc)+', description: 'Groups for quantification without creating a capture group.' },
  { category: 'Regex Syntax', title: 'Lookahead', snippet: 'foo(?=bar)', description: 'Matches "foo" only if followed by "bar", without consuming "bar".' },
  { category: 'Regex Syntax', title: 'Negative lookahead', snippet: 'foo(?!bar)', description: 'Matches "foo" only if NOT followed by "bar".' },
  { category: 'Regex Syntax', title: 'Lookbehind', snippet: '(?<=\\$)\\d+', description: 'Matches digits only if preceded by a "$", without consuming it.' },
  { category: 'Regex Syntax', title: 'Backreference', snippet: '(\\w+)\\s+\\1', description: 'Matches a repeated word by referencing capture group 1 again.' },
  { category: 'Regex Syntax', title: 'Word boundary', snippet: '\\bcat\\b', description: 'Matches "cat" as a whole word, not inside "category".' },
  { category: 'Regex Syntax', title: 'Lazy quantifier', snippet: '<.+?>', description: 'Matches as few characters as possible — stops at the first ">".' },

  // Git
  { category: 'Git', title: 'Amend last commit', snippet: 'git commit --amend --no-edit', description: 'Adds staged changes to the previous commit without changing its message.' },
  { category: 'Git', title: 'Interactive rebase', snippet: 'git rebase -i HEAD~5', description: 'Reorder, squash, or edit the last 5 commits interactively.' },
  { category: 'Git', title: 'Stash with untracked files', snippet: 'git stash push -u', description: 'Stashes tracked and untracked changes, leaving a clean working tree.' },
  { category: 'Git', title: 'Discard local changes', snippet: 'git restore --staged --worktree .', description: 'Resets the working tree and index to match HEAD, discarding local edits.' },
  { category: 'Git', title: 'Find which commit introduced a bug', snippet: 'git bisect start', description: 'Begins a binary search across commit history for a regression.' },
  { category: 'Git', title: 'Show file at a past commit', snippet: 'git show <commit>:<path>', description: 'Prints a file\'s contents as of a specific commit.' },
  { category: 'Git', title: 'Prune deleted remote branches', snippet: 'git fetch --prune', description: 'Removes local references to branches deleted on the remote.' },
  { category: 'Git', title: 'Cherry-pick a commit', snippet: 'git cherry-pick <commit>', description: 'Applies a single commit from another branch onto the current one.' },

  // Docker
  { category: 'Docker', title: 'Run interactively and remove on exit', snippet: 'docker run -it --rm <image> bash', description: 'Starts a container with an interactive shell, auto-removed when it exits.' },
  { category: 'Docker', title: 'Build with a tag', snippet: 'docker build -t myapp:latest .', description: 'Builds an image from the current directory\'s Dockerfile.' },
  { category: 'Docker', title: 'Follow container logs', snippet: 'docker logs -f <container>', description: 'Streams a running container\'s stdout/stderr.' },
  { category: 'Docker', title: 'Exec into a running container', snippet: 'docker exec -it <container> sh', description: 'Opens a shell inside an already-running container.' },
  { category: 'Docker', title: 'Remove all stopped containers', snippet: 'docker container prune', description: 'Deletes every stopped container to reclaim disk space.' },
  { category: 'Docker', title: 'List image layers/size', snippet: 'docker history <image>', description: 'Shows each layer of an image and its size contribution.' },
  { category: 'Docker', title: 'Compose up in the background', snippet: 'docker compose up -d', description: 'Starts all services defined in docker-compose.yml, detached.' },
  { category: 'Docker', title: 'Copy a file out of a container', snippet: 'docker cp <container>:/path/file ./file', description: 'Copies a file from a container\'s filesystem to the host.' },

  // PowerShell
  { category: 'PowerShell', title: 'List files recursively', snippet: 'Get-ChildItem -Recurse -File', description: 'Lists all files under the current directory, recursing into subfolders.' },
  { category: 'PowerShell', title: 'Filter objects by property', snippet: 'Get-Process | Where-Object { $_.CPU -gt 100 }', description: 'Filters a pipeline of objects by a property predicate.' },
  { category: 'PowerShell', title: 'Set an environment variable', snippet: '$env:NAME = "value"', description: 'Sets an environment variable for the current session.' },
  { category: 'PowerShell', title: 'Read a file as JSON', snippet: 'Get-Content file.json | ConvertFrom-Json', description: 'Parses a JSON file into a PSCustomObject.' },
  { category: 'PowerShell', title: 'Run a command as another user', snippet: 'Start-Process cmd -Verb RunAs', description: 'Launches a process elevated (UAC prompt).' },
  { category: 'PowerShell', title: 'Measure command execution time', snippet: 'Measure-Command { <script block> }', description: 'Times how long a script block takes to run.' },

  // Bash
  { category: 'Bash', title: 'Find and delete files', snippet: "find . -name '*.tmp' -delete", description: 'Recursively finds files matching a pattern and deletes them.' },
  { category: 'Bash', title: 'Substring replace in every match', snippet: "sed -i 's/foo/bar/g' file.txt", description: 'In-place replaces every occurrence of "foo" with "bar" in a file.' },
  { category: 'Bash', title: 'Chain commands only on success', snippet: 'cmd1 && cmd2', description: 'Runs cmd2 only if cmd1 exits with status 0.' },
  { category: 'Bash', title: 'Run in background and disown', snippet: 'long_task & disown', description: 'Runs a command in the background, detached from the shell so it survives logout.' },
  { category: 'Bash', title: 'Loop over lines of a file', snippet: 'while IFS= read -r line; do echo "$line"; done < file.txt', description: 'Safely reads a file line by line, preserving whitespace.' },
  { category: 'Bash', title: 'Retry a command N times', snippet: 'for i in {1..5}; do cmd && break || sleep 2; done', description: 'Retries a flaky command up to 5 times with a delay between attempts.' },

  // SQL
  { category: 'SQL', title: 'Upsert (Postgres)', snippet: 'INSERT INTO t (id, name) VALUES (1, \'a\') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;', description: 'Inserts a row, or updates it if the primary key already exists.' },
  { category: 'SQL', title: 'Window function running total', snippet: 'SUM(amount) OVER (ORDER BY created_at)', description: 'Computes a cumulative sum ordered by a column, without a GROUP BY.' },
  { category: 'SQL', title: 'Common table expression', snippet: 'WITH recent AS (SELECT * FROM orders WHERE created_at > now() - interval \'7 days\') SELECT * FROM recent;', description: 'Names a subquery for reuse within the same statement.' },
  { category: 'SQL', title: 'Find duplicate rows', snippet: 'SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;', description: 'Groups by a column and filters to groups with more than one row.' },
  { category: 'SQL', title: 'Case-insensitive match', snippet: "WHERE lower(name) = lower('Ada')", description: 'Compares strings ignoring case when the column has no case-insensitive collation.' },

  // CSS
  { category: 'CSS', title: 'Center with flexbox', snippet: 'display: flex; align-items: center; justify-content: center;', description: 'Centers a single child both horizontally and vertically.' },
  { category: 'CSS', title: 'Truncate text with ellipsis', snippet: 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', description: 'Clips overflowing single-line text and appends "…".' },
  { category: 'CSS', title: 'CSS variable with fallback', snippet: 'color: var(--text-color, #000);', description: 'Uses a custom property, falling back to a default if it\'s unset.' },
  { category: 'CSS', title: 'Grid auto-fit columns', snippet: 'grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));', description: 'Responsive grid columns that wrap without media queries.' },
  { category: 'CSS', title: 'Visually hidden but accessible', snippet: 'position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap;', description: 'Hides an element visually while keeping it available to screen readers.' },

  // HTML
  { category: 'HTML', title: 'Responsive image srcset', snippet: '<img src="img-800.jpg" srcset="img-400.jpg 400w, img-800.jpg 800w" sizes="(max-width: 600px) 400px, 800px">', description: 'Lets the browser pick the best image size for the viewport/DPR.' },
  { category: 'HTML', title: 'Lazy-load an image', snippet: '<img src="photo.jpg" loading="lazy" alt="…">', description: 'Defers loading an offscreen image until it nears the viewport.' },
  { category: 'HTML', title: 'Preconnect to a third-party origin', snippet: '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>', description: 'Warms up the DNS/TLS connection to a domain used later on the page.' },
  { category: 'HTML', title: 'Non-blocking script', snippet: '<script src="app.js" defer></script>', description: 'Downloads in parallel with parsing and runs after the DOM is ready, in order.' },

  // Unicode
  { category: 'Unicode', title: 'Zero-width space', snippet: 'U+200B', description: 'An invisible break point some text uses to allow wrapping without a visible space.' },
  { category: 'Unicode', title: 'Byte order mark', snippet: 'U+FEFF', description: 'Marks a text stream\'s encoding/byte order; can appear as a stray character if not stripped.' },
  { category: 'Unicode', title: 'Non-breaking space', snippet: 'U+00A0', description: 'A space that prevents a line break at that point.' },
  { category: 'Unicode', title: 'Right-to-left override', snippet: 'U+202E', description: 'Forces following text to render right-to-left — a known homograph/spoofing vector.' },

  // MIME Types
  { category: 'MIME Types', title: 'JSON', snippet: 'application/json', description: 'Standard MIME type for JSON payloads.' },
  { category: 'MIME Types', title: 'Form-encoded body', snippet: 'application/x-www-form-urlencoded', description: 'Default encoding for a plain HTML form POST.' },
  { category: 'MIME Types', title: 'Multipart form data', snippet: 'multipart/form-data', description: 'Required for forms that upload files.' },
  { category: 'MIME Types', title: 'Newline-delimited JSON', snippet: 'application/x-ndjson', description: 'One JSON value per line — common for streaming API responses.' },
  { category: 'MIME Types', title: 'WebAssembly module', snippet: 'application/wasm', description: 'MIME type a server must send for a .wasm file to be streamed-compiled.' },

  // Cron
  { category: 'Cron', title: 'Every 5 minutes', snippet: '*/5 * * * *', description: 'Runs at :00, :05, :10, … every hour.' },
  { category: 'Cron', title: 'Every weekday at 9am', snippet: '0 9 * * 1-5', description: 'Runs at 9:00 AM Monday through Friday.' },
  { category: 'Cron', title: 'First day of every month', snippet: '0 0 1 * *', description: 'Runs at midnight on the 1st of each month.' },
  { category: 'Cron', title: 'Every 6 hours', snippet: '0 */6 * * *', description: 'Runs at 00:00, 06:00, 12:00, and 18:00 every day.' },

  // chmod
  { category: 'chmod', title: 'Owner read/write/execute only', snippet: 'chmod 700 file', description: 'rwx for the owner, nothing for group/others — common for private scripts/keys.' },
  { category: 'chmod', title: 'Standard file permissions', snippet: 'chmod 644 file', description: 'Owner can read/write; group and others can only read.' },
  { category: 'chmod', title: 'Standard executable permissions', snippet: 'chmod 755 script.sh', description: 'Owner can read/write/execute; group and others can read/execute.' },
  { category: 'chmod', title: 'Recursively fix directory permissions', snippet: 'chmod -R 755 dir/', description: 'Applies 755 to a directory and everything inside it.' },
  { category: 'chmod', title: 'Add execute for everyone', snippet: 'chmod +x script.sh', description: 'Symbolic form: adds the execute bit without touching read/write bits.' },
];
