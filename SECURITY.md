# Security Policy

## Reporting a vulnerability

Please do **not** open public issues for security vulnerabilities.

RELAY-0 is a Roku channel game. The most likely issues are around save data handling, manifest configuration, and sideload/developer-mode hygiene rather than high-impact remote exploits. If you find something that looks real, report it privately.

## Where to report

Send a report to:

- [security contact to be set by maintainer]

Before publishing the channel, the maintainer should replace this with a monitored address or a GitHub Security Advisory link.

## What to include

- A clear description of the issue
- Steps to reproduce
- Affected version or commit
- Potential impact

## What to expect

The maintainer will acknowledge receipt and provide next steps.

## In-scope concerns

- Save data stored in `roRegistry`
- Channel manifest values
- Any future network or backend endpoints if they are added
- Developer-mode access and sideload process on the user's own Roku

## Out of scope for now

- Issues that only affect a user's personal Roku when developer mode is enabled locally, unless they indicate a broader problem with the channel package itself.

If you are unsure whether something belongs here, send it anyway.
