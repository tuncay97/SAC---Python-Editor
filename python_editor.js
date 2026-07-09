(function() {
    // 1. Custom Widget Şablonu Oluşturma
    let template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host {
                display: block;
                width: 100%;
                height: 100%;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            #container {
                display: flex;
                flex-direction: column;
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                padding: 10px;
                background: #f5f5f5;
            }
            #status {
                padding: 8px;
                margin-bottom: 8px;
                border-radius: 4px;
                background-color: #e3f2fd;
                color: #0d47a1;
                font-size: 13px;
                font-weight: bold;
            }
            #code-area {
                width: 100%;
                height: 150px;
                font-family: "Courier New", Courier, monospace;
                font-size: 14px;
                padding: 8px;
                box-sizing: border-box;
                border: 1px solid #ccc;
                border-radius: 4px;
                resize: none;
            }
            #btn-run {
                margin-top: 8px;
                padding: 10px;
                background-color: #2b78e4;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                font-size: 14px;
            }
            #btn-run:hover {
                background-color: #1a5ec2;
            }
            #output {
                margin-top: 8px;
                flex-grow: 1;
                background: #1e1e1e;
                color: #4af626;
                font-family: "Courier New", Courier, monospace;
                padding: 10px;
                border-radius: 4px;
                overflow-y: auto;
                white-space: pre-wrap;
                font-size: 13px;
            }
        </style>
        <div id="container">
            <div id="status">Python Motoru Başlatılıyor...</div>
            <textarea id="code-area" placeholder="# Python kodunuzu buraya yazın...\\n# Örn: print(sac_data)"></textarea>
            <button id="btn-run" disabled>Kodu Çalıştır</button>
            <div id="output">Konsol çıktısı burada görünecek...</div>
        </div>
    `;

    // 2. Web Component Sınıf Tanımı
    class SACPythonEditor extends HTMLElement {
        constructor() {
            super();
            this._shadowRoot = this.attachShadow({ mode: "open" });
            this._shadowRoot.appendChild(template.content.cloneNode(true));
            
            this.$status = this._shadowRoot.getElementById("status");
            this.$codeArea = this._shadowRoot.getElementById("code-area");
            this.$btnRun = this._shadowRoot.getElementById("btn-run");
            this.$output = this._shadowRoot.getElementById("output");
            
            this._sacData = "[]"; 

            this.$btnRun.addEventListener("click", () => this.runPython());
            this.initPython();
        }

        async initPython() {
            try {
                if (!window.loadPyodide) {
                    await this.loadScript("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js");
                }
                
                // KISITLAMAYI AŞAN ANAHTAR HAMLE:
                // Pyodide'ın dışarıya .zip isteği atmasını engellemek için stdLibURL'yi null yapıyoruz
                // ve lockfile'ı kapatıyoruz. Böylece çekirdek Python ayağa kalkıyor.
                this.pyodide = await window.loadPyodide({
                    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/",
                    stdLibURL: null, 
                    lockfile: null
                });

                this.$status.innerText = "🐍 Python Hazır! Verileri İşleyebilirsiniz.";
                this.$status.style.backgroundColor = "#e8f5e9";
                this.$status.style.color = "#2e7d32";
                this.$btnRun.disabled = false;
                
                this.$codeArea.value = `# SAC Veri Analizi (Saf Python Mantığı)\\n# Not: Şirket ağı kısıtlaması nedeniyle 'json' kütüphanesi yerine ham string metni işleyebilirsiniz.\\n\\nprint("Gelen Ham SAC Verisi:", sac_data)\\nprint("Metin Uzunluğu:", len(sac_data))`;

            } catch (error) {
                this.$status.innerText = "Başlatma Hatası: Güvenlik duvarı engeli.";
                this.$status.style.backgroundColor = "#ffebee";
                this.$status.style.color = "#c62828";
                this.$output.innerText = "Detaylı Hata: " + error.message;
            }
        }

        loadScript(src) {
            return new Promise((resolve, reject) => {
                let script = document.createElement("script");
                script.src = src;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        // SAC veri güncellemelerini hem Before hem After fonksiyonlarında güvenli şekilde yakalayalım
        onCustomWidgetBeforeUpdate(changedProperties) {
            this.updateSacData(changedProperties);
        }

        onCustomWidgetAfterUpdate(changedProperties) {
            this.updateSacData(changedProperties);
        }

        updateSacData(properties) {
            if (!properties) return;
            
            // Eğer myData adında bir property veya dataBinding objesi geliyorsa string'e çevirip saklayalım
            if ("myData" in properties) {
                const rawData = properties["myData"];
                this._sacData = typeof rawData === "object" ? JSON.stringify(rawData) : (rawData || "[]");
            } else if ("dataBinding" in properties) {
                // dataBinding.getData hatasını engellemek için güvenli sarmalama
                const db = properties["dataBinding"];
                if (db && typeof db.getData === "function") {
                    try {
                        this._sacData = JSON.stringify(db.getData());
                    } catch(e) {
                        console.warn("Veri stringify edilemedi.", e);
                    }
                }
            }
        }

        async runPython() {
            if (!this.pyodide) return;
            this.$output.innerText = "Kod yürütülüyor...";
            
            try {
                // SAC verisini Python içerisine global değişken olarak enjekte ediyoruz
                this.pyodide.globals.set("sac_data", this._sacData);
                
                // Çıktıları yakalamak için io kütüphanesini (eğer yüklenebildiyse) simüle et veya direkt çalıştır
                this.pyodide.runPython(`
                    import sys
                    class SimpleStdout:
                        def __init__(self): self.buf = ""
                        def write(self, s): self.buf += s
                        def flush(self): pass
                        def getvalue(self): return self.buf
                    sys.stdout = SimpleStdout()
                    sys.stderr = SimpleStdout()
                `);

                await this.pyodide.runPythonAsync(this.$codeArea.value);

                let stdout = this.pyodide.runPython("sys.stdout.getvalue()");
                let stderr = this.pyodide.runPython("sys.stderr.getvalue()");
                
                this.$output.innerText = stdout + (stderr ? "\\nHata Çıktısı:\\n" + stderr : "");
            } catch (err) {
                this.$output.innerText = "Python Çalışma Zamanı Hatası:\\n" + err.message;
            }
        }
    }

    customElements.define("sac-python-editor", SACPythonEditor);
})();
