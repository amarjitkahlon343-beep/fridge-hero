
const API_KEY = 'AIzaSyBo6F_AJf7MilaHA91bfVpw-alQ4mJ_2PU';

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

// ── Stored data ──
let currentRecipe = null;
let currentIngredients = [];
let punjabi = null;
let currentLang = 'en';

// ── Clean input helper ──
function clean(str) {
    return str.replace(/[\\\/]/g, '').trim();
}

function capitalise(str) {
    const c = clean(str);
    return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

// ── CO-STAR Prompt Builder ──
function buildCOSTARPrompt(ing1, ing2, ing3) {
    return `CONTEXT:
You are a Michelin 3-star executive chef with 25 years of experience in French haute cuisine. You have worked at the finest restaurants in Paris, Lyon, and New York. You are known for transforming simple, everyday ingredients into extraordinary culinary masterpieces.

OBJECTIVE:
Given exactly 3 ingredients provided by a home cook, create an elegant, restaurant-quality recipe that elevates these humble ingredients into a sophisticated dish worthy of a fine dining menu.

STYLE:
- Dish name must be in elegant French or French-inspired language
- Write ALL cooking instructions in clear, simple British English (UK spelling: colour, flavour, caramelise, etc.)
- Use professional culinary vocabulary (saute, deglaze, emulsify, julienne) but briefly explain each technique
- Descriptions should be vivid but easy to follow for a home cook

TONE:
Refined yet approachable. Make the home cook feel confident and inspired. Use British English throughout.

AUDIENCE:
Home cooks in the UK who want to impress their guests. They have basic cooking skills and standard kitchen equipment.

RESPONSE FORMAT:
Reply ONLY with valid JSON in this exact format — no markdown, no extra text:
{
  "dishName": "Elegant French-inspired dish name here",
  "steps": [
    "First detailed cooking step in simple British English",
    "Second detailed cooking step in simple British English",
    "Third and final step with plating instructions in simple British English"
  ]
}

INGREDIENTS TO USE: ${clean(ing1)}, ${clean(ing2)}, ${clean(ing3)}`;
}

// ── Punjabi Translation Prompt ──
function buildPunjabiPrompt(recipe) {
    return `Translate the following recipe into Punjabi (Gurmukhi script).

IMPORTANT RULES:
- Reply ONLY with a valid JSON object — nothing else before or after
- No extra explanation, no markdown, no code fences
- Keep each step as ONE single line — no line breaks inside a step
- Use simple everyday Punjabi that anyone can understand

Required JSON format:
{"dishName":"ਡਿਸ਼ ਦਾ ਨਾਮ","steps":["ਪਹਿਲਾ ਕਦਮ","ਦੂਜਾ ਕਦਮ","ਤੀਜਾ ਕਦਮ"]}

Recipe to translate:
Dish name: ${recipe.dishName}
Step 1: ${recipe.steps[0]}
Step 2: ${recipe.steps[1]}
Step 3: ${recipe.steps[2]}`;
}

// ── Render recipe into the UI ──
function renderRecipe(recipe, lang) {
    document.getElementById('dishName').textContent = recipe.dishName;

    const list = document.getElementById('recipeSteps');
    list.innerHTML = '';
    recipe.steps.forEach((step, i) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="snum">${i + 1}</div>
            <div class="stext ${lang === 'pa' ? 'punjabi-text' : ''}">${step}</div>
        `;
        list.appendChild(li);
    });
}

// ── Parse JSON safely ──
function safeParseJSON(raw) {
    let text = raw.trim();

    // Remove markdown code fences
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Remove invisible/control characters that break JSON
    text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

    // Extract only the JSON object (ignore any text before/after)
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
        text = text.substring(jsonStart, jsonEnd + 1);
    }

    // Remove line breaks inside JSON string values (common AI mistake)
    text = text.replace(/"([^"]*)"/g, (match) => {
        return match.replace(/\n/g, ' ').replace(/\r/g, '');
    });

    return JSON.parse(text);
}

// ── Switch Language (on window so HTML onclick can call it) ──
window.switchLanguage = async function (lang) {
    if (lang === currentLang) return;
    if (!currentRecipe) return;

    currentLang = lang;

    document.getElementById('btnEn').classList.toggle('active', lang === 'en');
    document.getElementById('btnPa').classList.toggle('active', lang === 'pa');

    if (lang === 'en') {
        renderRecipe(currentRecipe, 'en');
        return;
    }

    // Use cached Punjabi if available
    if (punjabi) {
        renderRecipe(punjabi, 'pa');
        return;
    }

    // Call API to translate
    const translateLoading = document.getElementById('translateLoading');
    const methodBlock = document.querySelector('.method-block');

    translateLoading.style.display = 'flex';
    methodBlock.style.opacity = '0.3';
    document.getElementById('btnEn').disabled = true;
    document.getElementById('btnPa').disabled = true;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: buildPunjabiPrompt(currentRecipe) }] }]
            })
        });

        if (response.status === 429) {
            showError('Rate limit reached. Please wait 1 minute and try again.');
            currentLang = 'en';
            document.getElementById('btnEn').classList.add('active');
            document.getElementById('btnPa').classList.remove('active');
            return;
        }

        if (!response.ok) {
            showError(`Translation failed (${response.status}). Please try again.`);
            currentLang = 'en';
            document.getElementById('btnEn').classList.add('active');
            document.getElementById('btnPa').classList.remove('active');
            return;
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0]) {
            showError('Translation failed. Please try again.');
            return;
        }

        const rawText = data.candidates[0].content.parts[0].text;

        try {
            punjabi = safeParseJSON(rawText);
            renderRecipe(punjabi, 'pa');
        } catch (parseErr) {
            console.error('Parse error:', parseErr);
            console.error('Raw text:', rawText);
            showError('Translation formatting issue. Please click ਪੰਜਾਬੀ again to retry.');
            punjabi = null;
            currentLang = 'en';
            document.getElementById('btnEn').classList.add('active');
            document.getElementById('btnPa').classList.remove('active');
        }

    } catch (err) {
        showError('Translation error: ' + err.message);
        console.error(err);
    } finally {
        translateLoading.style.display = 'none';
        methodBlock.style.opacity = '1';
        document.getElementById('btnEn').disabled = false;
        document.getElementById('btnPa').disabled = false;
    }
};

// ── Main Cook Function ──
document.getElementById('cookBtn').addEventListener('click', async () => {

    const ing1 = document.getElementById('ingredient1').value.trim();
    const ing2 = document.getElementById('ingredient2').value.trim();
    const ing3 = document.getElementById('ingredient3').value.trim();

    const btn = document.getElementById('cookBtn');
    const btnText = document.getElementById('btnText');
    const loading = document.getElementById('loading');
    const resultCard = document.getElementById('resultCard');
    const promptCard = document.getElementById('promptCard');

    if (!ing1 || !ing2 || !ing3) {
        showError('Please fill in all 3 ingredient fields to continue.');
        return;
    }

    // Reset all state
    hideError();
    currentRecipe = null;
    punjabi = null;
    currentLang = 'en';
    resultCard.style.display = 'none';
    promptCard.style.display = 'none';
    loading.style.display = 'flex';
    btn.disabled = true;
    btnText.textContent = 'Generating…';

    // Reset language buttons
    document.getElementById('btnEn').classList.add('active');
    document.getElementById('btnPa').classList.remove('active');

    const prompt = buildCOSTARPrompt(ing1, ing2, ing3);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (response.status === 429) { showError('Rate limit reached. Please wait 1 minute and try again.'); return; }
        if (response.status === 400) { showError('API error (400). Please check your API key in script.js.'); return; }
        if (!response.ok) { showError(`API error: ${response.status}. Please try again.`); return; }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0]) {
            showError('No response from AI. Please try again.');
            return;
        }

        const rawText = data.candidates[0].content.parts[0].text;
        const recipe = safeParseJSON(rawText);

        currentRecipe = recipe;
        currentIngredients = [ing1, ing2, ing3];

        // Render English recipe
        renderRecipe(recipe, 'en');

        // Ingredient tags
        const tagsEl = document.getElementById('ingredientsUsed');
        tagsEl.innerHTML = [ing1, ing2, ing3]
            .map(i => `<span class="rtag">${capitalise(i)}</span>`)
            .join('');

        // Show panels
        resultCard.style.display = 'block';
        document.getElementById('promptDisplay').textContent = prompt;
        promptCard.style.display = 'block';

        setTimeout(() => resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    } catch (err) {
        if (err instanceof SyntaxError) {
            showError('AI returned an unexpected format. Please try again.');
        } else {
            showError('Error: ' + err.message);
        }
        console.error(err);
    } finally {
        loading.style.display = 'none';
        btn.disabled = false;
        btnText.textContent = 'Generate Recipe';
    }
});

// ── Save as PDF (on window so HTML onclick can call it) ──
window.saveAsPDF = function () {
    if (!currentRecipe) return;

    const recipe = currentLang === 'pa' && punjabi ? punjabi : currentRecipe;
    const langLabel = currentLang === 'pa' ? 'Punjabi' : 'British English';

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const margin = 24;
    const pageW = 210;
    const contentW = pageW - margin * 2;
    let y = 20;

    // Teal top bar
    doc.setFillColor(13, 148, 136);
    doc.rect(0, 0, pageW, 5, 'F');

    // App name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(13, 148, 136);
    doc.text('FRIDGE HERO', margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 112, 133);
    doc.text(`AI Recipe · CO-STAR Prompting · ${langLabel}`, margin + 52, y);
    y += 10;

    // Line
    doc.setDrawColor(228, 231, 236);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageW - margin, y);
    y += 10;

    // Dish name label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(13, 148, 136);
    doc.text('DISH NAME', margin, y);
    y += 6;

    // Dish name
    doc.setFont('times', 'italic');
    doc.setFontSize(18);
    doc.setTextColor(16, 24, 40);
    const nameLines = doc.splitTextToSize(recipe.dishName, contentW);
    doc.text(nameLines, margin, y);
    y += nameLines.length * 8 + 6;

    // Ingredient tags
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    let tx = margin;
    currentIngredients.forEach(ing => {
        const label = capitalise(ing);
        const tw = doc.getTextWidth(label) + 8;
        doc.setFillColor(240, 253, 250);
        doc.setDrawColor(153, 246, 228);
        doc.roundedRect(tx, y - 4, tw, 7, 1.5, 1.5, 'FD');
        doc.setTextColor(15, 118, 110);
        doc.text(label, tx + 4, y);
        tx += tw + 5;
    });
    y += 10;

    // Divider
    doc.setDrawColor(228, 231, 236);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageW - margin, y);
    y += 10;

    // Method label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 112, 133);
    doc.text('METHOD', margin, y);
    y += 8;

    // Steps
    recipe.steps.forEach((step, i) => {
        doc.setFillColor(13, 148, 136);
        doc.circle(margin + 3.5, y - 1.5, 3.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text(`${i + 1}`, margin + 3.5, y, { align: 'center' });

        doc.setFont('times', 'italic');
        doc.setFontSize(10);
        doc.setTextColor(52, 64, 84);
        const lines = doc.splitTextToSize(step, contentW - 12);
        doc.text(lines, margin + 10, y);
        y += lines.length * 5.5 + 9;
    });

    // Footer
    y = 282;
    doc.setDrawColor(228, 231, 236);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(152, 162, 179);
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text('Session 1 Assignment · AI Foundations & Speed Coding', margin, y);
    doc.text(date, pageW - margin, y, { align: 'right' });

    // Bottom teal bar
    doc.setFillColor(13, 148, 136);
    doc.rect(0, 292, pageW, 5, 'F');

    const filename = currentRecipe.dishName.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_').substring(0, 40);
    const suffix = currentLang === 'pa' ? '_punjabi' : '_english';
    doc.save(`${filename}${suffix}_recipe.pdf`);
};

// ── Helpers ──
function showError(msg) {
    const el = document.getElementById('error');
    el.textContent = msg;
    el.style.display = 'block';
}

function hideError() {
    const el = document.getElementById('error');
    el.textContent = '';
    el.style.display = 'none';
}