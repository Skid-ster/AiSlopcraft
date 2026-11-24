# Production readiness design

Make the existing game playable and verifiable on the built same-origin Render service. Preserve Beta singleplayer, Classic creative, the temporary no-account 5×5 relay, Azure, and static Pages. Use Node 22 only. Keep procedural assets, existing HTTP protections, and portable saves.

Keep and constrain the legacy relay messages rather than deleting handlers covered by existing compatibility tests. Reject unauthorized changes at the relay, not in the browser. This is not a migration to an authoritative simulation, durable rooms, or accounts. Retain the existing build rather than replacing the game. Test the built application in Chromium rather than expanding jsdom into a renderer substitute.

Keep first-party rights reserved; preserve third-party permissions and the upstream PSX text without inventing attribution. Keep the verified Pages homepage until a Render URL is verified. Apply remote metadata only with repository access and leave live host/proxy checks open until observed.
