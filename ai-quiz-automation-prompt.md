# AI Learning Quiz Automation Prompt

## Context
You are helping to complete the daily AI learning quiz at https://learning.alibaba-inc.com/trs/ai-learning/me. This is a 20-question quiz that needs to be completed daily for a challenge.

## Quiz Structure
- **Total Questions**: 20 questions
- **Points per Question**: 15 points each
- **Total Possible Points**: 300 points per day
- **Question Types**: Single-choice questions
- **Format**: Questions appear in a drawer/modal interface

## Automation Strategy

### Phase 1: Initial Setup (Fast Track)
```
1. Open the learning page
2. Locate and click the "Daily Quiz" card using text-based selector
3. Find and click the "Earn points" button using text content
4. Wait for quiz drawer to open
```

### Phase 2: Rapid Question Processing (Optimized Loop)

For each question (1-20), execute this optimized sequence:

#### Step 1: Question Extraction (Single Query)
```javascript
// Extract all question data in ONE query using stable selectors
const quizData = {
  questionNumber: document.querySelector('[class*="quiz-header"], [class*="difficulty"]')?.textContent,
  questionText: document.querySelector('[class*="quiz-title"]')?.textContent,
  options: Array.from(document.querySelectorAll('[class*="quiz-option"], [class*="option"]')).map((opt, i) => ({
    key: opt.querySelector('[class*="option-key"]')?.textContent || String.fromCharCode(65 + i),
    text: opt.querySelector('[class*="option-text"]')?.textContent || opt.textContent
  }))
};
```

#### Step 2: Instant Answer Selection
- **Analyze question immediately** upon extraction
- **Select correct answer based on AI knowledge** (no hesitation)
- **Click the correct option** using nth-child selector directly

#### Step 3: Immediate Submission
- **Click Submit button** without waiting for visual feedback
- **Find button by text**: "Submit" or "提交"
- **No delay between selection and submission**

#### Step 4: Rapid Progression
- **Wait minimal time** (500ms) for processing
- **Click "Next question"** button
- **Find button by text**: "Next question" or "Next"
- **Immediately proceed to next question**

### Phase 3: Completion Verification
```
1. Check final score display
2. Verify "20/20" completion status
3. Record total points earned
4. Confirm quiz completion
```

## Key Optimization Techniques

### 1. **Stable Selector Strategy (CRITICAL)**
**NEVER use hash-based class selectors** (e.g. `.className___XXXXX`) - these change with every build!

**Always use these stable approaches:**
- **Text-based selection**: Find elements by their text content
- **Semantic class names**: Use meaningful class names like `[class*="quiz-option"]` 
- **Structural selectors**: Use `nth-child` for ordered elements
- **Attribute selectors**: Use `[class*="keyword"]` for partial class matching

**Examples of BAD selectors (avoid):**
```javascript
// ❌ These break every build — class names with ___<hash> suffix are generated per build!
// .querySelector('.quizCard___XXXXX')
// .querySelector('.actionBtn___XXXXX')
// .querySelector('.certBtn___XXXXX')
// .querySelector('.courseActionBtn___XXXXX')
```

**Examples of GOOD selectors (use):**
```javascript
// ✅ These work across builds!
Array.from(document.querySelectorAll('div')).find(el => 
  el.textContent.includes('Daily Quiz')
)
Array.from(document.querySelectorAll('button')).find(btn => 
  btn.textContent.includes('Earn points')
)
document.querySelectorAll('[class*="quiz-option"]')
```

### 2. **Batch Processing**
- Extract all question data in single JavaScript execution
- Don't make separate queries for question, options, buttons

### 3. **Minimal Wait Times**
- 500ms between operations (vs 2-3 seconds manual)
- No waiting for visual feedback/animations
- Trust DOM state changes

### 4. **Pre-computed Answer Patterns**
Based on common AI quiz patterns, prioritize these answer types:
- **A**: Definitions, first steps, initial preparations
- **B**: Verification, spot-checking, validation approaches  
- **C**: Structured methods, clear guidelines, systematic approaches
- **D**: Dynamic adjustment, feedback-based optimization, flexibility

### 5. **Error Handling**
- If submit fails, retry once immediately
- If next button not found, wait 1 second and retry
- If quiz drawer closes unexpectedly, reopen from main page

## Common Question Patterns & Quick Answers

### Human-AI Collaboration
- **Optimal division**: AI generates, humans judge quality → Select option about "AI handles generation, humans judge"

### Information Verification  
- **Best practice**: Spot-check key facts and sources → Select option about "spot-checking" or "verification"

### AI Tool Deployment
- **Key factor**: Fit with specific task workflow → Select option about "workflow fit" or "task integration"

### Prompt Design
- **Effective elements**: Clear goals, constraints, examples → Select option about "structured requirements" or "clear definitions"

### Model Capabilities
- **Autoregressive models**: Predict tokens step by step → Select option about "sequential prediction" or "token-by-token"

### RAG vs Retraining
- **Document tasks**: Use retrieval-based context → Select option about "retrieval" or "context injection"

### AI Governance
- **Ongoing process**: Continuous monitoring and optimization → Select option about "continuous" or "ongoing"

## Execution Commands (Copy-Paste Ready)

### Start Quiz
```javascript
// Find and click quiz card by text content
const quizCard = Array.from(document.querySelectorAll('div')).find(el => 
  el.textContent.includes('Daily Quiz') && el.textContent.includes('0/20')
);
quizCard?.click();

// Wait 1 second, then find and click earn points button
setTimeout(() => {
  const earnPointsBtn = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Earn points') || btn.textContent.includes('Earn')
  );
  earnPointsBtn?.click();
}, 1000);
```

### Answer Question N (Replace N with 1-4 for option A-D)
```javascript
// Select option N by finding all options and clicking the Nth one
const options = document.querySelectorAll('[class*="quiz-option"], [class*="option"]');
if (options[N-1]) {
  options[N-1].click();
  
  // Find and click submit button by text content
  setTimeout(() => {
    const submitBtn = Array.from(document.querySelectorAll('button, span')).find(el => 
      el.textContent.includes('Submit') || el.textContent.includes('提交')
    );
    submitBtn?.click();
  }, 300);
}
```

### Next Question
```javascript
// Find and click next question button by text content
setTimeout(() => {
  const nextBtn = Array.from(document.querySelectorAll('button, span')).find(el => 
    el.textContent.includes('Next question') || el.textContent.includes('Next')
  );
  nextBtn?.click();
}, 500);
```

## Performance Targets
- **Total Time**: Under 3 minutes for all 20 questions
- **Per Question**: Under 10 seconds average
- **Success Rate**: 100% (20/20 correct)
- **Points**: 300 points daily

## Troubleshooting

### Quiz Not Opening
- Check if page fully loaded
- Look for "Daily Quiz" card by text content search
- Verify "Earn points" button by finding buttons with "Earn" text
- Use text-based selectors instead of hash-based class names

### Submit Button Not Working
- Ensure option is selected (check for selected state)
- Wait for DOM update before clicking submit
- Find submit button by text content: "Submit" or "提交"
- Try finding in both button and span elements

### Next Button Not Appearing
- Wait for feedback animation to complete
- Check if quiz completed (look for "20/20" or completion message)
- Verify drawer is still open

## Success Indicators
- ✅ Quiz shows "20/20" progress
- ✅ Total score shows 300 points
- ✅ Completion message appears
- ✅ Quiz card shows completed status on main page

## Notes for Next Session
- Quiz questions may repeat or vary slightly
- Always read full question before answering
- Patterns remain consistent even with different questions
- Focus on understanding concepts, not memorizing answers
