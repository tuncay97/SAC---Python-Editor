(function() {
    // Pyodide'i CDN üzerinden çekiyoruz
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js";
    document.head.appendChild(script);

    let template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host { display: block; width: 100%; height: 100%; font-family: sans-serif; }
            #container { padding: 15px; background: #ffffff; border: 1px solid #ccc; height: 100%; }
            textarea { width: 100%; height: 120px; margin: 10px 0; border: 1px solid #aaa; }
            #btn-run { background: #2b78e4; color: white; padding: 8px; border: none; cursor: pointer; }
            #output { margin-top: 10px; background: #000; color: #0f0; padding: 10px; min-height: 50px; }
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
                try {
                    const res = await this.pyodide.runPythonAsync(code);
                    this.shadowRoot.getElementById("output").innerText = res;
                } catch (e) {
                    this.shadowRoot.getElementById("output").innerText = "Python Hatası: " + e.message;
                }
            };
        }
    }
    customElements.define("sac-python-editor", PythonEditor);
})();
