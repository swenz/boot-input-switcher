#!/bin/sh
# Boot Input Switcher - runtime script. Runs as root on the TV.
#
# Modes:
#   start-boot           spawn "boot" detached (called by the init.d hook)
#   boot                 wait for system services, switch once, then monitor wake-ups
#   monitor              only monitor wake-ups from standby
#   switch               switch right now (ignores the delay)
#   set TARGET DELAY ON_WAKE   save config, install hook, (re)start monitor
#   disable              remove hook and stop monitor (config is kept)
#   status               print state as key=value lines

APP_ID=io.github.swenz.bootinputswitcher
SELF=/media/developer/apps/usr/palm/applications/$APP_ID/boot/switcher.sh
DATA_DIR=/var/lib/webosbrew/boot-input-switcher
CONF=$DATA_DIR/config
HOOK_DIR=/var/lib/webosbrew/init.d
HOOK=$HOOK_DIR/boot-input-switcher
PIDFILE=/tmp/boot-input-switcher.pid
LOG=/tmp/boot-input-switcher.log

[ -f "$SELF" ] || SELF="$0"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"
    # keep the log small
    if [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt 200 ]; then
        tail -n 100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
    fi
}

conf_get() {
    sed -n "s/^$1=//p" "$CONF" 2>/dev/null | head -n 1
}

valid_id() {
    case "$1" in
        '' | *[!A-Za-z0-9._-]*) return 1 ;;
    esac
    return 0
}

load_conf() {
    TARGET=$(conf_get TARGET)
    DELAY=$(conf_get DELAY)
    ON_WAKE=$(conf_get ON_WAKE)
    valid_id "$TARGET" || TARGET=''
    case "$DELAY" in
        '' | *[!0-9]*) DELAY=0 ;;
    esac
    [ "$DELAY" -gt 300 ] && DELAY=300
    [ "$ON_WAKE" = 0 ] || ON_WAKE=1
}

foreground() {
    luna-send -n 1 luna://com.webos.applicationManager/getForegroundAppInfo '{}' 2>/dev/null |
        sed -n 's/.*"appId" *: *"\([^"]*\)".*/\1/p'
}

power_state() {
    luna-send -n 1 luna://com.webos.service.tvpower/power/getPowerState '{}' 2>/dev/null |
        sed -n 's/.*"state" *: *"\([^"]*\)".*/\1/p'
}

# Wait until the app manager answers and something is in the foreground,
# i.e. the system finished restoring its own last input.
wait_ready() {
    n=0
    while [ "$n" -lt 90 ]; do
        fg=$(foreground)
        if [ -n "$fg" ]; then
            log "system ready after ~$((n * 2))s (foreground: $fg)"
            return 0
        fi
        n=$((n + 1))
        sleep 2
    done
    log "system services did not become ready in time, trying anyway"
    return 1
}

# do_switch REASON [nodelay]
do_switch() {
    load_conf
    if [ -z "$TARGET" ]; then
        log "$1: no target configured"
        return 1
    fi
    if [ "$2" != nodelay ] && [ "$DELAY" -gt 0 ]; then
        sleep "$DELAY"
    fi
    i=0
    while [ "$i" -lt 3 ]; do
        i=$((i + 1))
        out=$(luna-send -n 1 luna://com.webos.applicationManager/launch "{\"id\":\"$TARGET\"}" 2>&1)
        sleep 3
        fg=$(foreground)
        if [ "$fg" = "$TARGET" ]; then
            log "$1: switched to $TARGET (attempt $i)"
            return 0
        fi
        log "$1: attempt $i failed, foreground is '$fg': $out"
    done
    return 1
}

# Quick Start+ / standby does not reboot the TV, so the init.d hook never
# runs again. Watch the power state and switch after every real wake-up.
monitor() {
    log "monitor started"
    while :; do
        luna-send -i luna://com.webos.service.tvpower/power/getPowerState '{"subscribe":true}' 2>/dev/null |
            {
                was_off=0
                while read -r line; do
                    state=$(echo "$line" | sed -n 's/.*"state" *: *"\([^"]*\)".*/\1/p')
                    case "$state" in
                        Suspend | "Active Standby" | "Power Off")
                            was_off=1
                            ;;
                        Active)
                            case "$line" in
                                *'"processing"'*) ;;
                                *)
                                    if [ "$was_off" = 1 ]; then
                                        was_off=0
                                        load_conf
                                        if [ "$ON_WAKE" = 1 ]; then
                                            do_switch wake
                                        fi
                                    fi
                                    ;;
                            esac
                            ;;
                    esac
                done
            }
        sleep 5
    done
}

stop_daemon() {
    if [ -f "$PIDFILE" ]; then
        pid=$(cat "$PIDFILE")
        case "$pid" in
            '' | *[!0-9]*) ;;
            *)
                # daemon is a session leader: kill the whole process group
                kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null
                ;;
        esac
        rm -f "$PIDFILE"
    fi
}

spawn() {
    stop_daemon
    setsid sh "$SELF" "$1" < /dev/null > /dev/null 2>&1 &
}

install_hook() {
    mkdir -p "$HOOK_DIR"
    cat > "$HOOK" << EOF
#!/bin/sh
# Installed by Boot Input Switcher ($APP_ID).
# Harmless no-op once the app has been uninstalled.
S=$SELF
[ -f "\$S" ] && sh "\$S" start-boot
exit 0
EOF
    chmod 755 "$HOOK"
}

case "$1" in
    start-boot)
        spawn boot
        ;;
    boot)
        echo $$ > "$PIDFILE"
        log "boot hook started (uptime $(cut -d' ' -f1 /proc/uptime)s)"
        wait_ready
        do_switch boot
        monitor
        ;;
    monitor)
        echo $$ > "$PIDFILE"
        monitor
        ;;
    switch)
        do_switch manual nodelay
        ;;
    set)
        valid_id "$2" || { echo "invalid target" >&2; exit 2; }
        case "$3" in '' | *[!0-9]*) echo "invalid delay" >&2; exit 2 ;; esac
        case "$4" in 0 | 1) ;; *) echo "invalid on_wake" >&2; exit 2 ;; esac
        mkdir -p "$DATA_DIR"
        printf 'TARGET=%s\nDELAY=%s\nON_WAKE=%s\n' "$2" "$3" "$4" > "$CONF.tmp" &&
            mv "$CONF.tmp" "$CONF"
        sync
        install_hook
        spawn monitor
        log "config saved: target=$2 delay=$3 on_wake=$4"
        echo ok
        ;;
    disable)
        rm -f "$HOOK"
        stop_daemon
        log "disabled"
        echo ok
        ;;
    status)
        load_conf
        echo "uid=$(id -u)"
        echo "target=$TARGET"
        echo "delay=$DELAY"
        echo "on_wake=$ON_WAKE"
        [ -f "$HOOK" ] && echo "enabled=1" || echo "enabled=0"
        if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            echo "daemon=1"
        else
            echo "daemon=0"
        fi
        echo "foreground=$(foreground)"
        echo "---log---"
        tail -n 6 "$LOG" 2>/dev/null
        ;;
    *)
        echo "usage: $0 start-boot|boot|monitor|switch|set TARGET DELAY ON_WAKE|disable|status" >&2
        exit 2
        ;;
esac
exit 0
