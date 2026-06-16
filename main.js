document.addEventListener("DOMContentLoaded", () => {
    // 1. Mobile Navigation Hamburger Menu
    const hamburger = document.querySelector(".hamburger");
    const navLinks = document.querySelector(".nav-links");

    if (hamburger && navLinks) {
        hamburger.addEventListener("click", (e) => {
            e.stopPropagation();
            hamburger.classList.toggle("active");
            navLinks.classList.toggle("active");
        });

        // Close menu when a link is clicked
        const links = document.querySelectorAll(".nav-link");
        links.forEach(link => {
            link.addEventListener("click", () => {
                hamburger.classList.remove("active");
                navLinks.classList.remove("active");
            });
        });

        // Close menu when clicking outside
        document.addEventListener("click", (e) => {
            if (navLinks.classList.contains("active") &&
                !navLinks.contains(e.target) &&
                !hamburger.contains(e.target)) {
                hamburger.classList.remove("active");
                navLinks.classList.remove("active");
            }
        });

        // Close menu when user scrolls the page
        window.addEventListener("scroll", () => {
            if (navLinks.classList.contains("active")) {
                hamburger.classList.remove("active");
                navLinks.classList.remove("active");
            }
        }, { passive: true });
    }

    // 2. JAMB Candidate Toggle Switch (Waitlist Form Page)
    const toggleContainer = document.getElementById("jamb-toggle");
    const toggleInput = document.getElementById("jamb-candidate-input");
    let yesOption, noOption;

    if (toggleContainer && toggleInput) {
        yesOption = toggleContainer.querySelector(".toggle-option[data-val='yes']");
        noOption = toggleContainer.querySelector(".toggle-option[data-val='no']");

        toggleContainer.addEventListener("click", (e) => {
            const clickedOption = e.target.closest(".toggle-option");
            if (!clickedOption) return;

            const val = clickedOption.getAttribute("data-val");

            if (val === "yes") {
                yesOption.classList.add("active");
                noOption.classList.remove("active");
                toggleInput.value = "yes";
            } else {
                noOption.classList.add("active");
                yesOption.classList.remove("active");
                toggleInput.value = "no";
            }
        });
    }

    // ─── Validation Helpers ────────────────────────────────────────────────────

    // Accepts any syntactically valid email (personal + business domains)
    function isValidEmail(val) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
    }

    function showFieldError(inputId, message) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.classList.add("input-error");
        input.classList.remove("input-valid");
        const existing = input.parentElement.querySelector(".field-error-msg");
        if (existing) existing.remove();
        const tip = document.createElement("p");
        tip.className = "field-error-msg";
        tip.innerHTML = `<span class="field-error-icon">&#9888;</span> ${message}`;
        input.parentElement.appendChild(tip);
    }

    function clearFieldError(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.classList.remove("input-error");
        if (input.value.trim()) input.classList.add("input-valid");
        const existing = input.parentElement.querySelector(".field-error-msg");
        if (existing) existing.remove();
    }

    function clearAllErrors() {
        document.querySelectorAll(".field-error-msg").forEach(el => el.remove());
        document.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
        document.querySelectorAll(".input-valid").forEach(el => el.classList.remove("input-valid"));
    }

    // Initialize Supabase Client directly on front-end
    // KEY: Supabase anon/public key — safe for browser (new sb_publishable_ format)
    const supabaseUrl = 'https://pbfvnxrsuavxychyiphs.supabase.co';
    const supabaseKey = 'sb_publishable_iGsfsJmZ6bW0P8M7X_ahjg_j7KvtGUf';
    const supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

    // 3. Waitlist Form Submission Handlers
    const waitlistForm = document.getElementById("waitlist-form");
    const modalBackdrop = document.getElementById("success-modal-backdrop");
    const closeModalBtn = document.getElementById("close-modal-btn");

    if (waitlistForm) {
        // Clear error styling as user types
        ["full-name", "email", "phone"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("input", () => clearFieldError(id));
            }
        });

        waitlistForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            clearAllErrors();

            const fullName = document.getElementById("full-name").value.trim();
            const email = document.getElementById("email").value.trim();
            const phone = document.getElementById("phone").value.trim();
            const isJamb = toggleInput ? toggleInput.value : "no";

            let hasError = false;

            if (!fullName) {
                showFieldError("full-name", "Please enter your full name.");
                hasError = true;
            }

            if (!email) {
                showFieldError("email", "Please enter your email address.");
                hasError = true;
            } else if (!isValidEmail(email)) {
                showFieldError("email", "That doesn't look like a valid email. Try: you@company.com");
                hasError = true;
            }

            if (hasError) return;

            // Show loading state on submit button
            const submitBtn = waitlistForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = "Adding you...";

            try {
                if (!supabaseClient) {
                    throw new Error("Supabase SDK failed to load. Please check your internet connection.");
                }

                // Check for duplicate email locally first
                const { data: existing, error: selectError } = await supabaseClient
                    .from('waitlist')
                    .select('email')
                    .eq('email', email.toLowerCase())
                    .maybeSingle();

                if (selectError) {
                    console.error("Supabase select verification error:", selectError);
                }

                if (existing) {
                    showFieldError("email", "This email is already registered on the waitlist!");
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                    return;
                }

                // Insert directly to database
                const { data, error } = await supabaseClient
                    .from('waitlist')
                    .insert([{
                        name: fullName,
                        email: email.toLowerCase(),
                        phone: phone || null,
                        jamb_candidate: (isJamb === 'yes')
                    }]);

                if (error) {
                    console.error("Supabase insert details error:", error);
                    throw error;
                }

                // Trigger Edge Function to send welcome email after successful insert.
                // Uses supabaseClient.functions.invoke() — the Supabase JS client
                // handles CORS and auth automatically. Raw fetch() causes CORS
                // preflight failures because the gateway rejects bare OPTIONS requests.
                try {
                    console.log("[waitlist] Invoking send-welcome-email via Supabase client...");

                    const { data: fnData, error: fnError } = await supabaseClient.functions.invoke(
                        'send-welcome-email',
                        {
                            body: { name: fullName, email: email.toLowerCase() }
                        }
                    );

                    if (fnError) {
                        // Log but don't block — data is already saved
                        console.error("[waitlist] Edge Function error:", fnError.message || fnError);
                    } else {
                        console.log("[waitlist] Edge Function success:", fnData);
                    }
                } catch (fnErr) {
                    // Network failure, timeout, etc. — data is saved, email is best-effort
                    console.error("[waitlist] Edge Function exception:", fnErr.message);
                }

                // Show Success State
                if (modalBackdrop) {
                    modalBackdrop.classList.add("active");
                }

                // Clear form fields
                waitlistForm.reset();
                clearAllErrors();
                if (yesOption && noOption && toggleInput) {
                    yesOption.classList.add("active");
                    noOption.classList.remove("active");
                    toggleInput.value = "yes";
                }
            } catch (err) {
                console.error("Failed to submit waitlist form:", err);
                const globalErrorDiv = document.getElementById("form-message");
                if (globalErrorDiv) {
                    globalErrorDiv.textContent = err.message || "Failed to join waitlist. Please try again.";
                    globalErrorDiv.classList.add("error");
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        });
    }

    // Close Modal Event Handlers
    if (modalBackdrop) {
        if (closeModalBtn) {
            closeModalBtn.addEventListener("click", () => {
                modalBackdrop.classList.remove("active");
            });
        }

        modalBackdrop.addEventListener("click", (e) => {
            if (e.target === modalBackdrop) {
                modalBackdrop.classList.remove("active");
            }
        });
    }
});
