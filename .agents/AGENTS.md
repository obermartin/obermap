# Agent Rules

- Always delete any temporary utility, fix, or patching scripts you create immediately after they have served their purpose and the task is complete.

- When making code changes, as a last verification step before declaring a task finished, ALWAYS check if the app loads without crashing (e.g. by checking the local dev server logs or requesting the user to verify).

- When reporting a task as done, ALWAYS make sure the local dev server is currently up and running so the user can immediately test it without having to start it themselves. If it immediately crashes on startup, DO NOT report the task as done. Instead, fix whatever is causing the crash, restart the server, and verify it stays up before completing your turn.
