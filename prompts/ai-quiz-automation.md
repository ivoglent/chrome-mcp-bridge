# AI Learning Quiz Automation Prompt

## Context
You are helping to complete the daily AI learning quiz at https://learning.alibaba-inc.com/trs/ai-learning/me. This is a 20-question quiz that needs to be completed daily for a challenge.

You have access to **Chrome Extension MCP tools** that let you interact with the browser directly — no eval or raw JavaScript injection needed. Use these tools:
- `list_tabs` — List all open browser tabs
- `open_tab` — Open a new tab with a URL
- `get_html` — Get HTML of a page or element by CSS selector
- `click_element` — Click an element by CSS selector
- `type_text` — Type text into an input element
- `scroll_page` — Scroll the page
- `hover_element` — Hover over an element
- `mouse_click_at` — Click at specific x,y coordinates
- `execute_js` — Run JavaScript in the page context (uses Function constructor, no eval)

## Quiz Structure
- **Total Questions**: 20 questions
- **Points per Question**: 15 points each
- **Total Possible Points**: 300 points per day
- **Question Types**: Single-choice questions
- **Format**: Questions appear in a drawer/modal interface

## Automation Strategy

### Phase 1: Initial Setup

1. **Open the learning page**
   ```
   Tool: open_tab
   url: "https://learning.alibaba-inc.com/trs/ai-learning/me"
   ```

2. **Wait for page load** (2-3 seconds), then **get the page HTML** to find the quiz card
   ```
   Tool: get_html
   selector: "body"
   ```

3. **Click the "Daily Quiz" card** — use `execute_js` to find by text content since class names are hash-based
   ```
   Tool: execute_js
   script: |
     const card = Array.from(document.querySelectorAll('div')).find(el =>
       el.textContent.includes('Daily Quiz') && el.offsetHeight > 0 && el.offsetHeight < 300
     );
     if (card) { card.click(); return 'clicked'; }
     return 'not found';
   ```

4. **Click the "Earn points" button**
   ```
   Tool: execute_js
   script: |
     const btn = Array.from(document.querySelectorAll('button, span')).find(el =>
       el.textContent.includes('Earn points') || el.textContent.includes('Earn')
     );
     if (btn) { btn.click(); return 'clicked'; }
     return 'not found';
   ```

5. **Wait 1-2 seconds** for quiz drawer to open

### Phase 2: Question Processing Loop (Repeat for Questions 1-20)

#### Step 1: Extract Question Data
Use `execute_js` to extract all question info in one call:
```
Tool: execute_js
script: |
  const questionEl = document.querySelector('[class*="quiz-title"]');
  const options = Array.from(document.querySelectorAll('[class*="quiz-option"], [class*="option"]'));
  return {
    question: questionEl ? questionEl.textContent.trim() : 'NOT FOUND',
    options: options.map((opt, i) => ({
      index: i,
      key: opt.querySelector('[class*="option-key"]')?.textContent || String.fromCharCode(65 + i),
      text: (opt.querySelector('[class*="option-text"]')?.textContent || opt.textContent).trim()
    }))
  };
```

#### Step 2: Analyze & Select Answer
- **Read the question and options** from the extracted data
- **Determine the correct answer** based on AI knowledge
- **Click the correct option** using `execute_js`:
```
Tool: execute_js
script: |
  const options = document.querySelectorAll('[class*="quiz-option"], [class*="option"]');
  if (options[INDEX]) { options[INDEX].click(); return 'selected option ' + INDEX; }
  return 'option not found';
```
*(Replace INDEX with 0 for A, 1 for B, 2 for C, 3 for D)*

#### Step 3: Submit Answer
```
Tool: execute_js
script: |
  const btn = Array.from(document.querySelectorAll('button, span')).find(el =>
    el.textContent.trim() === 'Submit' || el.textContent.trim() === '提交'
  );
  if (btn) { btn.click(); return 'submitted'; }
  return 'submit button not found';
```

#### Step 4: Proceed to Next Question
Wait 500ms-1s, then:
```
Tool: execute_js
script: |
  const btn = Array.from(document.querySelectorAll('button, span')).find(el =>
    el.textContent.includes('Next question') || el.textContent.includes('Next')
  );
  if (btn) { btn.click(); return 'next'; }
  return 'next button not found';
```

### Phase 3: Completion Verification
```
Tool: execute_js
script: |
  const body = document.body.innerText;
  const hasCompletion = body.includes('20/20') || body.includes('300');
  return { completed: hasCompletion, bodySnippet: body.substring(0, 500) };
```

## Key Rules

### 1. Stable Selector Strategy (CRITICAL)
**NEVER use hash-based class selectors** (e.g. `.className___XXXXX`) — these change with every build!

**Always use these stable approaches:**
- **Text-based selection via `execute_js`**: Find elements by their text content
- **Partial class matching**: Use `[class*="quiz-option"]` for semantic class fragments
- **Structural selectors**: Use `nth-child` for ordered elements

**BAD selectors (avoid):**
```javascript
// ❌ These break every build — class names with ___<hash> suffix are generated per build!
document.querySelector('.quizCard___XXXXX')
document.querySelector('.actionBtn___XXXXX')
```

**GOOD selectors (use):**
```javascript
// ✅ Text-based (most reliable)
Array.from(document.querySelectorAll('div')).find(el => el.textContent.includes('Daily Quiz'))
Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Earn points'))

// ✅ Partial class match (stable semantic fragments)
document.querySelectorAll('[class*="quiz-option"]')
document.querySelector('[class*="quiz-title"]')
```

### 2. Use MCP Tools, Not Raw eval
- **Use `execute_js` tool** for DOM queries that need text-based element finding
- **Use `click_element` tool** when you have a stable CSS selector
- **Use `get_html` tool** to inspect page structure
- **Never rely on `eval()`** — the `execute_js` tool uses `new Function()` which is CSP-friendlier

### 3. Batch Processing
- Extract question + all options in a **single `execute_js` call**
- Don't make separate queries for question text, each option, and buttons

### 4. Minimal Wait Times
- 500ms-1s between operations
- No waiting for visual feedback/animations
- Trust DOM state changes

### 5. Error Recovery
- If submit fails → retry once immediately
- If next button not found → wait 1 second and retry
- If quiz drawer closes → re-click the quiz card from main page
- If `execute_js` fails with CSP error → use `click_element` with `[class*="..."]` selectors instead

## Pre-computed Answer Patterns

Based on common AI quiz patterns, prioritize these answer types:
- **A**: Definitions, first steps, initial preparations
- **B**: Verification, spot-checking, validation approaches
- **C**: Structured methods, clear guidelines, systematic approaches
- **D**: Dynamic adjustment, feedback-based optimization, flexibility

### Common Topics & Quick Answers

| Topic | Key Concept | Look For |
|-------|------------|----------|
| Human-AI Collaboration | AI generates, humans judge quality | "AI handles generation, humans judge" |
| Information Verification | Spot-check key facts and sources | "spot-checking" or "verification" |
| AI Tool Deployment | Fit with specific task workflow | "workflow fit" or "task integration" |
| Prompt Design | Clear goals, constraints, examples | "structured requirements" or "clear definitions" |
| Model Capabilities | Predict tokens step by step | "sequential prediction" or "token-by-token" |
| RAG vs Retraining | Use retrieval-based context | "retrieval" or "context injection" |
| AI Governance | Continuous monitoring and optimization | "continuous" or "ongoing" |

## Performance Targets
- **Total Time**: Under 3 minutes for all 20 questions
- **Per Question**: Under 10 seconds average
- **Success Rate**: 100% (20/20 correct)
- **Points**: 300 points daily

## Troubleshooting

### Quiz Not Opening
- Use `get_html` to check if page fully loaded
- Use `execute_js` to find "Daily Quiz" card by text content
- Verify "Earn points" button exists by searching button text
- Never use hash-based class names as selectors

### Submit Button Not Working
- Ensure option is selected (check for selected state via `execute_js`)
- Wait for DOM update before clicking submit
- Find submit button by text: "Submit" or "提交"
- Search in both `button` and `span` elements

### Next Button Not Appearing
- Wait 1-2 seconds for feedback animation
- Check if quiz completed (look for "20/20" text)
- Verify drawer is still open via `get_html`

## Success Indicators
- ✅ Quiz shows "20/20" progress
- ✅ Total score shows 300 points
- ✅ Completion message appears
- ✅ Quiz card shows completed status on main page
