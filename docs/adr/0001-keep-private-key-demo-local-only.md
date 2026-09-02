# Keep the private-key signing demo local-only

The Ethereum Sepolia 工具 Demo imports a dedicated test private key into browser memory to demonstrate local transaction signing, so it will run only on a developer's local machine and will not be publicly hosted. Publishing it would add deployment, CDN, third-party script, extension, and XSS trust surfaces that this non-production wallet demo is not designed to secure; any future public distribution must first revisit the account and signing model.

The private-key input is cleared immediately after import, while the resulting local account remains available only through the current browser wallet session. An explicit lock action, page refresh, or page close ends the session; the account is never persisted or automatically restored.

The Local Account remains inside a module-private, non-reactive memory boundary and is never placed in Pinia or exposed to Vue Devtools. The common header receives only derived public state and controlled actions; the application also loads no runtime third-party scripts, remote fonts, analytics, or remote logging.
