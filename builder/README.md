# builder
Input: research.json.
Output: runnable multi-agent game, world.json, controls and tests.
Generate the game code from the brief. Provide an animated view for humans and the same actions through an agent interface.
The engine owns inventory, time and results. Customer/coworker agents have goals and limited views.
Test with scripted actions: valid transitions, nonnegative stock and deterministic state updates.
Freeze rules before actor training.
