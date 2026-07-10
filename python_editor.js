(function() {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js";
    document.head.appendChild(script);

    let template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host { display: block; width: 100%; height: 100%; font-family: sans-serif; }
            #container { padding: 15px; background: #ffffff; border: 1px solid #ccc; height: 100%; display: flex; flex-direction: column; }
            textarea { width: 100%; height: 120px; margin: 10px 0; border: 1px solid #aaa; }
            #btn-run { background: #2b78e4; color: white; padding: 8px; border: none; cursor: pointer; }
            #output { margin-top: 10px; background: #000; color: #0f0; padding: 10px; flex-grow: 1; overflow-y: auto; white-space: pre-wrap; }
        </style>
        <div id="container">
            <div id="status">🐍 Python Yükleniyor...</div>
            <textarea id="code" placeholder="Python kodunu buraya yaz..."></textarea>
            <button id="btn-run" disabled>Kodu Çalıştır</button>
            <div id="output">Çıktı burada görünecek.</div>
        </div>
    `;

    class PythonEditor extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: "open" }).appendChild(template.content.cloneNode(true));
            this.init();
        }

        async init() {
            const check = setInterval(async () => {
                if (typeof loadPyodide !== 'undefined') {
                    clearInterval(check);
                    try {
                        this.pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/" });
                        
                        // Çıktıları yakalamak için stdout'u yeniden yönlendiriyoruz
                        await this.pyodide.runPythonAsync(`
                            import sys
                            import io
                            sys.stdout = io.StringIO()
                        `);
                        
                        this.shadowRoot.getElementById("status").innerText = "✅ Python Hazır!";
                        this.shadowRoot.getElementById("btn-run").disabled = false;
                    } catch (e) {
                        this.shadowRoot.getElementById("status").innerText = "❌ Hata: " + e.message;
                    }
                }
            }, 500);
        }

        connectedCallback() {
            this.shadowRoot.getElementById("btn-run").onclick = async () => {
                const code = this.shadowRoot.getElementById("code").value;
                const outputDiv = this.shadowRoot.getElementById("output");
                try {
                    // Önceki çıktıları temizle
                    await this.pyodide.runPythonAsync("sys.stdout = io.StringIO()");
                    
                    // Kodu çalıştır
                    await this.pyodide.runPythonAsync(code);
                    
                    // Yakalanan çıktıyı al
                    const output = this.pyodide.runPython("sys.stdout.getvalue()");
                    outputDiv.innerText = output || "Kod başarıyla çalıştı (çıktı yok).";
                } catch (e) {
                    outputDiv.innerText = "Python Hatası: " + e.message;
                }
            };
        }
    }
    customElements.define("sac-python-editor", PythonEditor);
})();
