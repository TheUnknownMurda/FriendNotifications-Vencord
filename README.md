# FriendsRecentProfileUpdate

A [Vencord](https://vencord.dev) user plugin that notifies you, and keeps a history, when one of your friends changes their profile:

- username and display name
- avatar and banner
- bio and pronouns
- profile colors

## Installation

1. Set up Vencord from source ([guide](https://docs.vencord.dev/installing/custom-plugins/)).
2. Copy this folder into `src/userplugins/` (you get `src/userplugins/FriendsRecentProfileUpdate/index.tsx`).
3. Run `pnpm build` (or `pnpm inject` the first time), restart Discord and enable **FriendsRecentProfileUpdate** in the Plugins tab.

## Usage

- A notification appears when a change is detected. Click it to open that friend's history.
- The history shows the old and the new value side by side (last 1000 changes, kept across restarts). Open it with the **button at the top of Discord**, by right-clicking a friend, or from the plugin settings. Changes you have not seen yet are marked **New**, and the top bar button shows a red dot.
- Right-click a friend > **Profile tracking** to open their history, stop tracking them, turn their notifications off, or choose which changes to track for them.
- In the plugin settings, **What to track** has a table with one row per friend and one column per kind of change (plus notifications). The **Default settings** row applies to every friend you did not change, new friends included.

## What is detected, and when

Discord does not tell clients about every profile edit, so not everything shows up instantly:

| Change | When it is detected |
| --- | --- |
| Username, display name, avatar | Almost instantly while you are online, and at startup for changes made while Discord was closed |
| Bio, pronouns, banner, profile colors | When the friend's full profile gets loaded: when you open their profile, or with the background refresh below |

The first time the plugin sees a value it only remembers it, so nothing is reported right after installing it.

### Background refresh (off by default)

The **Background refresh** setting loads your friends' profiles in the background, one friend every 2 minutes by default (adjustable from 1 minute to 1 hour), so bio, pronoun, banner and color changes get caught without opening each profile. With 150 friends and the default delay, each profile is checked about every 5 hours. Friends for whom none of these four changes are tracked are skipped.

This sends requests Discord's own client would not send on its own. The plugin waits between requests and pauses when Discord asks it to slow down, but automated activity is against Discord's terms of service and could, in rare cases, get an account flagged. Use it at your own risk, and prefer a long delay.

## Things that may break with a Discord update

The top bar button is added with a patch of Discord's code (the same place the VencordToolbox plugin uses). If Discord changes its top bar, the button disappears until the patch is updated; everything else keeps working, and the history stays available from the right-click menu, the plugin settings and the Vencord Toolbox menu.

The rest relies on internal Discord modules that Vencord exposes:

- the user and profile stores (where the profile data is read),
- the profile endpoint and the events used by the background refresh,
- the image helpers used for the avatar and banner previews,
- the top bar button component.

If Discord renames or reshapes them, the detection or the previews could stop working until Vencord (or this plugin) is updated.
