# Skill nudge: scans user's prompt for bilingual (RU/EN) triggers,
# echoes a one-line reminder via UserPromptSubmit additionalContext.
# Non-blocking by design — always exits 0, never throws.
#
# Layered priority: specific skills win over generic ones (e.g. /qa beats /test).
# Stops after 3 hits to avoid noise.

[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw) { exit 0 }
    $payload = $raw | ConvertFrom-Json -ErrorAction Stop
} catch {
    exit 0
}

$promptText = $payload.prompt
if (-not $promptText) { exit 0 }

$p = $promptText.ToLower()

# Order matters: more specific triggers first. We cap at 3 hits total.
$triggers = @(
    # === Lifecycle: spec → plan → build → test → review → ship ===
    @{ skill = '/spec';                           patterns = @('напиши спеку', 'напиши тз', 'спецификация', 'write a spec', 'write the spec', 'define spec') }
    @{ skill = '/plan';                           patterns = @('распиши план', 'разбей на шаги', 'make a plan', 'план реализации', 'plan this out', 'breakdown') }
    @{ skill = '/build';                          patterns = @('реализуй', 'делаем', 'давай делать', 'build this', 'implement this', 'next task', 'incremental build') }
    @{ skill = '/tdd';                            patterns = @('напиши тест', 'red-green', 'red green', 'tdd', 'test-driven', 'failing test first') }
    @{ skill = '/review-local';                   patterns = @('проверь pr', 'review pr', 'pre-landing', 'review the diff', 'check my diff', 'код-ревью локально') }
    @{ skill = '/review';                         patterns = @('пройдись по коду', 'code review', 'multi-axis', 'review correctness') }
    @{ skill = '/ship-local';                     patterns = @('шипи локально', 'ship local', 'local ship') }
    @{ skill = '/ship';                           patterns = @('шипи', 'выкатывай', 'выкатить', 'ready to ship', 'ship it', 'deploy this', 'давай зашипим') }

    # === Specialized engineering ===
    @{ skill = '/qa';                             patterns = @('тестируй сайт', 'qa pass', 'find bugs', 'прогон ui', 'qa test', 'qa сделаем', 'qa этого') }
    @{ skill = '/diagnose';                       patterns = @('диагностируй', 'диагноз', 'reproduce the bug', 'minimize the bug', 'регрессия') }
    @{ skill = '/investigate';                    patterns = @('почему не работает', 'разберись почему', 'root cause', 'find why', 'investigate this') }
    @{ skill = '/debugging-and-error-recovery';   patterns = @('отладь', 'дебагни', 'дебажить', 'найди баг', 'debug this', 'fix this bug', 'something is broken') }
    @{ skill = '/improve-codebase-architecture';  patterns = @('улучши архитектуру', 'рефактори модуль', 'refactor module', 'architecture refactor', 'tightly-coupled') }
    @{ skill = '/code-simplify';                  patterns = @('упрости', 'убери лишнее', 'simplify this', 'too complex', 'reduce complexity') }
    @{ skill = '/triage';                         patterns = @('triage', 'разбери эти задачи', 'приоритизируй', 'prepare issues for') }
    @{ skill = '/performance-optimization';       patterns = @('lighthouse', 'тормозит', 'медленно работает', 'оптимизация перф', 'perf budget', 'performance issue', 'core web vitals') }
    @{ skill = '/security-and-hardening';         patterns = @('секьюр', 'уязвимость', 'security review', 'harden', 'vulnerability', 'sql injection', 'xss') }

    # === Design & UI ===
    @{ skill = '/design-review';                  patterns = @('визуальный аудит', 'design review', 'отполируй ui', 'проверь дизайн', 'design audit', 'visual qa') }
    @{ skill = '/design-consultation';            patterns = @('design system', 'brand guidelines', 'design.md', 'дизайн-система', 'brand book') }
    @{ skill = '/nothing-design';                 patterns = @('nothing style', 'nothing-design', 'nothing design') }
    @{ skill = '/frontend-ui-engineering';        patterns = @('верстай', 'новая страница', 'новый компонент', 'frontend ui', 'build a component') }

    # === Product / thinking ===
    @{ skill = '/grill-me';                       patterns = @('опроси меня', 'grill me', 'допроси меня', 'опроси по плану') }
    @{ skill = '/grill-with-docs';                patterns = @('прощупай', 'grill this plan', 'grill the design', 'stress-test against context') }
    @{ skill = '/interview-me';                   patterns = @('интервью', 'interview me', 'я не уверен чего хочу', 'before we start') }
    @{ skill = '/idea-refine';                    patterns = @('ideate', 'refine this idea', 'stress-test my plan', 'разверни идею') }
    @{ skill = '/office-hours';                   patterns = @('обсудим идею', 'brainstorm', 'is this worth', 'office hours', 'продуктовая модель', 'wedge') }
    @{ skill = '/to-prd';                         patterns = @('напиши prd', 'write a prd', 'this becomes a prd', 'сделай из этого prd') }
    @{ skill = '/prototype';                      patterns = @('прототип', 'playground', 'throwaway prototype', 'попробуй несколько вариантов') }

    # === Anti-failure (when I'm uncertain) ===
    @{ skill = '/doubt-driven-development';       patterns = @('сомневаюсь', 'не уверен', 'убедись что не врёшь', 'убедись что не врешь', 'second opinion', 'doubt this', 'double-check', 'adversarial review') }
    @{ skill = '/source-driven-development';      patterns = @('по докам', 'актуальные доки', 'ground in docs', 'cite the source', 'verified against docs') }
    @{ skill = '/handoff';                        patterns = @('handoff', 'передай контекст', 'сожми сессию', 'save session', 'компресс сессию') }
    @{ skill = '/context-engineering';            patterns = @('контекст переполнен', 'прибери контекст', 'context bloat', 'reset context', 'почисти контекст') }
    @{ skill = '/zoom-out';                       patterns = @('зум-аут', 'зум аут', 'zoom out', 'zoom-out', 'give me a map', 'дай карту') }

    # === Verify / run ===
    @{ skill = '/verify';                         patterns = @('проверь что работает', 'verify the fix', 'confirm it works', 'does this work') }
    @{ skill = '/run';                            patterns = @('запусти приложение', 'покажи как работает', 'screenshot the app', 'open the app') }
)

$hits = New-Object System.Collections.Generic.List[string]
foreach ($t in $triggers) {
    foreach ($pattern in $t.patterns) {
        if ($p.Contains($pattern.ToLower())) {
            if (-not $hits.Contains($t.skill)) { $hits.Add($t.skill) }
            break
        }
    }
    if ($hits.Count -ge 3) { break }
}

# Marketing/SMM nudge — no skill, but remind about brand voice rules (CLAUDE.md §11.11)
$marketingCues = @('маркетинг', 'smm', 'пост в инсту', 'пост в тг', 'reel', 'каруcель', 'instagram post', 'twitter post', 'tweet', 'investor pitch', 'launch copy', 'landing copy')
$marketingHit = $false
foreach ($cue in $marketingCues) {
    if ($p.Contains($cue.ToLower())) { $marketingHit = $true; break }
}

if ($hits.Count -eq 0 -and -not $marketingHit) { exit 0 }

$msg = ""
if ($hits.Count -gt 0) {
    $msg = "[skill-nudge] Consider " + ($hits -join " or ") + " for this task."
}
if ($marketingHit) {
    if ($msg) { $msg += " " }
    $msg += "[brand voice] Marketing copy: neutral, no provider names, no investor framing, no 'elite/by invitation'. See CLAUDE.md §11.9–11.11."
}

$result = @{
    hookSpecificOutput = @{
        hookEventName     = "UserPromptSubmit"
        additionalContext = $msg
    }
}

$result | ConvertTo-Json -Compress
exit 0
