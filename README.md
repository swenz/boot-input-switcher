# Boot Input Switcher

webOS homebrew app that switches an LG TV to a fixed source every time it turns on –
HDMI 1–4, AV, Live TV or any installed app.

Requires a **rooted TV with [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel)**.
Developed against webOS 6.5.3 (ARMv7); it only uses shell and Luna calls, so other
rooted webOS versions should work as well.

## How it works

| Part | What it does |
| --- | --- |
| Config app (`app/`) | Pick the source, an optional extra delay, and whether to also switch on wake from standby. |
| `app/boot/switcher.sh` | Runs as root. Waits until the system is up, then calls `luna://com.webos.applicationManager/launch` with the chosen app id (e.g. `com.webos.app.hdmi1`) and checks that it really ended up in the foreground (up to 3 attempts). |
| `/var/lib/webosbrew/init.d/boot-input-switcher` | Tiny hook installed when you press **Save**. Homebrew Channel runs it on every boot; it starts `switcher.sh` in the background. |

Two details worth knowing:

- **Standby is not a boot.** With Quick Start+ (and for a while after every power-off) the TV only
  suspends, so `init.d` hooks do not run again. The script therefore keeps a small watcher on
  `luna://com.webos.service.tvpower/power/getPowerState` and switches after each real wake-up.
  This can be turned off in the app.
- **No own root service.** The app runs its commands through
  `luna://org.webosbrew.hbchannel.service/exec`, so root comes from Homebrew Channel.
  The manifest declares `rootRequired: true`.

Files on the TV:

| Path | Purpose |
| --- | --- |
| `/var/lib/webosbrew/boot-input-switcher/config` | Settings (`TARGET`, `DELAY`, `ON_WAKE`); survives app updates |
| `/var/lib/webosbrew/init.d/boot-input-switcher` | Boot hook; a no-op once the app is uninstalled |
| `/tmp/boot-input-switcher.log` | Log of the current uptime, also shown in the app |

## Install

Manifest URL:

```
https://github.com/swenz/boot-input-switcher/releases/latest/download/io.github.swenz.bootinputswitcher.manifest.json
```

- **Homebrew Channel:** install from the manifest URL above.
- **From a root shell on the TV** (same mechanism):

  ```sh
  luna-send -i luna://org.webosbrew.hbchannel.service/install \
    '{"ipkUrl":"https://github.com/swenz/boot-input-switcher/releases/latest/download/io.github.swenz.bootinputswitcher_1.0.0_all.ipk","ipkHash":"<sha256 from the manifest>","subscribe":true}'
  ```

- **From a PC:** download the `.ipk` from the [releases](https://github.com/swenz/boot-input-switcher/releases)
  and install it with [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) or
  `ares-install`.

Then open **Boot Input Switcher** on the TV, choose a source and press **Save**.
**Test now** switches immediately.

## Uninstall

Choose **Disabled** and press **Save** (removes the hook and stops the watcher), then uninstall the app.
If you uninstall without doing that, the leftover hook does nothing; remove it with
`rm /var/lib/webosbrew/init.d/boot-input-switcher` if you like.

## Build

```sh
npm install -g @webos-tools/cli
node build.js
```

This writes the `.ipk` and `io.github.swenz.bootinputswitcher.manifest.json` (with the matching
SHA-256) to `dist/`. Both files are attached to each GitHub release.

`webosbrew/io.github.swenz.bootinputswitcher.yml` is the package entry for submitting the app to
the [webosbrew apps repo](https://github.com/webosbrew/apps-repo).

## License

[MIT](LICENSE)
