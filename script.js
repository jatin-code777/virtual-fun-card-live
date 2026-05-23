(() => {
    // Two modes:
    //   • Dev: window.GIFT_CONFIG is the full config (current source repo).
    //   • Prod: window.GIFT_PUBLIC has non-sensitive settings; window.GIFT_PAYLOAD
    //     is an AES-GCM ciphertext that decrypts to the rest using the password.
    const IS_PROD = !window.GIFT_CONFIG && !!window.GIFT_PAYLOAD;
    const C = IS_PROD ? Object.assign({}, window.GIFT_PUBLIC) : window.GIFT_CONFIG;

    // ---------- Theme ----------
    const root = document.documentElement;
    root.style.setProperty('--bg-1', C.colors.bgStart);
    root.style.setProperty('--bg-2', C.colors.bgEnd);
    root.style.setProperty('--btn', C.colors.button);
    root.style.setProperty('--btn-hover', C.colors.buttonHover);
    root.style.setProperty('--text', C.colors.text);
    root.style.setProperty('--card-back', C.colors.cardBack);
    root.style.setProperty('--float-duration', C.animations.floatDuration);
    root.style.setProperty('--bounce-speed', C.animations.bounceSpeed);
    document.title = C.pageTitle;

    // ---------- Floating background ----------
    function spawnFloaters(count = 18) {
        const container = document.querySelector('.floating-elements');
        for (let i = 0; i < count; i++) {
            const span = document.createElement('span');
            span.className = 'floater';
            span.textContent = C.floatingEmojis[Math.floor(Math.random() * C.floatingEmojis.length)];
            span.style.left = Math.random() * 100 + 'vw';
            span.style.animationDelay = (Math.random() * 15) + 's';
            span.style.animationDuration = (12 + Math.random() * 18) + 's';
            span.style.fontSize = (1.2 + Math.random() * 2) + 'rem';
            container.appendChild(span);
        }
    }
    // In prod, emojis are encrypted — spawn floaters after unlock.
    if (!IS_PROD) spawnFloaters();

    // ---------- Screen navigation ----------
    function show(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        const el = document.getElementById(id);
        el.classList.remove('hidden');
        document.body.classList.toggle('centered', id === 'screen-3');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ---------- Gate ----------
    const gate = C.gate;
    document.getElementById('gateHint').textContent = gate.hint;
    document.getElementById('gateInput').placeholder = gate.placeholder;
    document.getElementById('gateBtn').textContent = gate.unlockBtn;
    document.getElementById('gateError').textContent = gate.wrongMsg;

    async function sha256Hex(s) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Decrypt the prod payload using the entered password. Returns the secret
    // sub-config on success; throws on wrong password (AES-GCM auth-tag fails).
    function b64ToBytes(s) {
        const bin = atob(s);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    async function decryptPayload(password) {
        const p = window.GIFT_PAYLOAD;
        const salt = b64ToBytes(p.salt);
        const iv = b64ToBytes(p.iv);
        const ct = b64ToBytes(p.ct);
        const baseKey = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(password),
            { name: 'PBKDF2' }, false, ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: p.iter, hash: 'SHA-256' },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false, ['decrypt']
        );
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
        return JSON.parse(new TextDecoder().decode(pt));
    }

    function rejectGate() {
        const errorEl = document.getElementById('gateError');
        const input = document.getElementById('gateInput');
        errorEl.classList.remove('hidden');
        const container = document.querySelector('.container');
        container.classList.remove('shake');
        void container.offsetWidth;
        container.classList.add('shake');
        input.value = '';
        input.focus();
    }

    document.getElementById('gateForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('gateInput');
        const errorEl = document.getElementById('gateError');
        const guess = input.value.trim().toLowerCase().replace(/\s+/g, '');

        if (IS_PROD) {
            try {
                const secrets = await decryptPayload(guess);
                Object.assign(C, secrets);
                document.title = C.pageTitle;
                spawnFloaters();
                wireUpPostUnlock();
                errorEl.classList.add('hidden');
                show('screen-1');
            } catch {
                rejectGate();
            }
            return;
        }

        // Dev mode: keep the old hash-check behaviour
        const hash = await sha256Hex(guess);
        if (hash === gate.passwordHash) {
            errorEl.classList.add('hidden');
            show('screen-1');
        } else {
            rejectGate();
        }
    });

    // ---------- Everything that depends on the (post-unlock) secret config ----------
    function wireUpPostUnlock() {
        // Screen 1: Do you like me?
        document.getElementById('q1Text').textContent = C.question1.text;
        document.getElementById('q1Yes').textContent = C.question1.yesBtn;
        document.getElementById('q1No').textContent = C.question1.noBtn;
        document.getElementById('q1Secret').textContent = C.question1.secretAnswer;

        // Screen 2 text bits
        document.getElementById('q2Text').textContent = C.question2.text;
        document.getElementById('startText').textContent = C.question2.startText;
        document.getElementById('q2Next').textContent = C.question2.nextBtn;

        // Screen 3 text bits
        document.getElementById('cardIntro').textContent = C.card.intro;
        document.getElementById('flipHint').textContent = C.card.flipHint;
        document.getElementById('cardImg').src = C.card.frontImg;
        document.getElementById('cardImg').alt = `Card for ${C.name}`;
        document.getElementById('cardTitle').textContent = C.card.title;
        const poem = document.getElementById('cardPoem');
        poem.innerHTML = '';
        C.card.poem.forEach(line => {
            const d = document.createElement('div');
            d.textContent = line;
            poem.appendChild(d);
        });
        document.getElementById('cardSig').textContent = C.card.signature;
        document.getElementById('cardSignOff').textContent = C.card.signOff;
    }

    // In dev, wire everything immediately so the rest of the original script
    // (event handlers below) can find populated elements.
    if (!IS_PROD) wireUpPostUnlock();


    // "Obviously" is a tease — doesn't advance, just nudges toward the real answer
    const q1Yes = document.getElementById('q1Yes');
    const q1Nudge = document.getElementById('q1Nudge');
    let nudgeIdx = 0;
    q1Yes.addEventListener('click', () => {
        q1Nudge.textContent = C.question1.yesNudges[nudgeIdx % C.question1.yesNudges.length];
        nudgeIdx++;
        q1Nudge.classList.remove('hidden');
        q1Yes.classList.remove('wiggle');
        void q1Yes.offsetWidth;
        q1Yes.classList.add('wiggle');
        // Hint that the secret-answer corner button is the way
        secretWrap.classList.add('revealed', 'pulse');
    });
    document.getElementById('q1Secret').addEventListener('click', () => show('screen-2'));

    const noBtn = document.getElementById('q1No');
    function dodge() {
        const pad = 20;
        const w = noBtn.offsetWidth, h = noBtn.offsetHeight;
        const x = pad + Math.random() * (window.innerWidth - w - pad * 2);
        const y = pad + Math.random() * (window.innerHeight - h - pad * 2);
        noBtn.style.position = 'fixed';
        noBtn.style.left = x + 'px';
        noBtn.style.top = y + 'px';
        noBtn.style.zIndex = 5;
    }
    noBtn.addEventListener('mouseenter', dodge);
    noBtn.addEventListener('focus', dodge);
    noBtn.addEventListener('click', dodge);
    noBtn.addEventListener('touchstart', (e) => { e.preventDefault(); dodge(); }, { passive: false });

    // Reveal the secret-answer corner button shortly after screen 1 shows
    var secretWrap = document.querySelector('.secret-answer');
    const obs = new MutationObserver(() => {
        if (!document.getElementById('screen-1').classList.contains('hidden')) {
            setTimeout(() => secretWrap.classList.add('revealed'), 4000);
        }
    });
    obs.observe(document.getElementById('screen-1'), { attributes: true, attributeFilter: ['class'] });

    // ---------- Screen 2: Love meter ----------
    const loveValue = document.getElementById('loveValue');
    const extraLove = document.getElementById('extraLove');
    const loveBar   = document.getElementById('loveBarFill');
    const q2Next    = document.getElementById('q2Next');

    // Visual cap on bar width so layout stays sane; numeric value keeps climbing.
    const MAX_VISUAL_PCT = 1800;
    const FILL_DURATION  = 2200;   // ms to reach 100%
    const PAUSE_AT_100   = 3000;   // ms breather at 100% before going beyond
    const EXP_DURATION   = 5500;   // ms of exponential growth after the pause
    const FINAL_VALUE    = 999999; // numeric value at end of exp phase

    function formatValue(v) {
        if (v >= 100000) return Math.round(v / 1000) + ',000';
        if (v >= 10000)  return Math.round(v).toLocaleString();
        return Math.round(v).toString();
    }

    // Milestone tracking handled inline by phase transitions in runLoveBar.
    function pushMessage(text) {
        extraLove.classList.remove('hidden');
        const div = document.createElement('div');
        div.className = 'love-msg';
        div.textContent = text;
        extraLove.appendChild(div);
    }

    function runLoveBar() {
        const start = performance.now();
        const totalDuration = FILL_DURATION + PAUSE_AT_100 + EXP_DURATION;
        let stopped = false;
        let lastShown = -1;
        let hit100 = false;
        let beyondTriggered = false;
        function frame(now) {
            if (stopped) return;
            const t = now - start;
            let value;
            if (t <= FILL_DURATION) {
                // Phase 1: linear 0 → 100
                value = (t / FILL_DURATION) * 100;
            } else if (t <= FILL_DURATION + PAUSE_AT_100) {
                // Phase 1.5: hold at 100 for a beat
                value = 100;
                if (!hit100) {
                    hit100 = true;
                    pushMessage(C.loveMessages.normal);
                }
            } else {
                // Phase 2: exponential beyond 100
                const u = (t - FILL_DURATION - PAUSE_AT_100) / EXP_DURATION;
                value = 100 * Math.pow(FINAL_VALUE / 100, Math.min(u, 1));
                if (!beyondTriggered) {
                    beyondTriggered = true;
                    loveBar.classList.add('overflowing');
                    pushMessage(C.loveMessages.high);
                }
            }
            const rounded = Math.round(value);
            if (rounded !== lastShown) {
                lastShown = rounded;
                loveValue.textContent = formatValue(rounded);
                loveBar.style.width = Math.min(value, MAX_VISUAL_PCT) + '%';
            }
            if (t < totalDuration) {
                requestAnimationFrame(frame);
            } else {
                stopped = true;
                loveValue.textContent = '∞';
                loveValue.classList.add('infinity');
                loveBar.style.width = MAX_VISUAL_PCT + '%';
                pushMessage(C.loveMessages.extreme);
                q2Next.classList.remove('hidden');
            }
        }
        requestAnimationFrame(frame);
    }

    // Trigger auto-animation when screen 2 becomes visible (only once)
    let barStarted = false;
    const screen2 = document.getElementById('screen-2');
    new MutationObserver(() => {
        if (!barStarted && !screen2.classList.contains('hidden')) {
            barStarted = true;
            // small delay so the screen-fade animation lands first
            setTimeout(runLoveBar, 350);
        }
    }).observe(screen2, { attributes: true, attributeFilter: ['class'] });

    q2Next.addEventListener('click', () => show('screen-3'));

    // ---------- Screen 3: Card flip ----------
    const flipper = document.getElementById('cardFlipper');
    function flip() {
        flipper.classList.toggle('flipped');
        if (flipper.classList.contains('flipped')) heartBurst();
    }
    flipper.addEventListener('click', flip);
    flipper.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    });

    function heartBurst() {
        const container = document.querySelector('.floating-elements');
        for (let i = 0; i < 30; i++) {
            const span = document.createElement('span');
            span.className = 'floater';
            span.textContent = C.floatingEmojis[Math.floor(Math.random() * C.floatingEmojis.length)];
            span.style.left = (40 + Math.random() * 20) + 'vw';
            span.style.bottom = '-40px';
            span.style.fontSize = (1.5 + Math.random() * 2.5) + 'rem';
            span.style.animationDuration = (6 + Math.random() * 8) + 's';
            container.appendChild(span);
            setTimeout(() => span.remove(), 14000);
        }
    }
})();
