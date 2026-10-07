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

    // ─── Avatar & Headcount Logic ──────────────────────────────────────────────
    const EXISTING_AVATARS = [
        "avatar/avatar1.jpg",
        "avatar/avatar2.jpg",
        "avatar/avatar3.jpg",
        "avatar/avatar4.jpg",
        "avatar/avatar5.jpg"
    ];

    function shuffleArray(arr) {
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    let currentWaitlistCount = null;

    function updateAvatarDisplay(waitlistCount) {
        const count = (typeof waitlistCount === 'number' && !isNaN(waitlistCount)) ? waitlistCount : 0;
        const avatarsToShow = Math.min(Math.max(0, count), 5);
        const avatarGroups = document.querySelectorAll(".avatar-group");

        avatarGroups.forEach(group => {
            if (avatarsToShow === 0) {
                group.style.display = "none";
                return;
            }

            group.style.display = "flex";
            const imgs = group.querySelectorAll("img");
            const shuffled = shuffleArray(EXISTING_AVATARS);

            imgs.forEach((img, idx) => {
                if (idx < avatarsToShow) {
                    img.style.display = "inline-block";
                    img.src = shuffled[idx];
                } else {
                    img.style.display = "none";
                }
            });
        });
    }

    // ─── Validation Helpers ────────────────────────────────────────────────────

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

    // ─── Supabase Client Setup & Real Headcount Counter ────────────────────────
    const supabaseUrl = 'https://pbfvnxrsuavxychyiphs.supabase.co';
    const supabaseKey = 'sb_publishable_iGsfsJmZ6bW0P8M7X_ahjg_j7KvtGUf';
    const supabaseClient = (window.supabase && typeof window.supabase.createClient === 'function') 
        ? window.supabase.createClient(supabaseUrl, supabaseKey) 
        : null;

    function formatNumberAbbrev(num) {
        if (num < 1000) {
            return `${num}`;
        } else if (num < 1000000) {
            const k = num / 1000;
            const formatted = (k % 1 === 0) ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '');
            return `${formatted}K`;
        } else if (num < 1000000000) {
            const m = num / 1000000;
            const formatted = (m % 1 === 0) ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, '');
            return `${formatted}M`;
        } else {
            const b = num / 1000000000;
            const formatted = (b % 1 === 0) ? b.toFixed(0) : b.toFixed(1).replace(/\.0$/, '');
            return `${formatted}B`;
        }
    }

    function formatWaitlistText(count, isHomePage) {
        if (typeof count !== 'number' || isNaN(count)) {
            return "Join the waitlist";
        }

        if (count <= 0) {
            return "Be among the first students on the waitlist";
        }

        const formattedNumber = `${formatNumberAbbrev(count)}+`;
        const noun = (count === 1) ? "student" : "students";
        const suffix = isHomePage ? "already on the waitlist" : "on the waitlist";

        return `Join ${formattedNumber} ${noun} ${suffix}`;
    }

    async function fetchWaitlistCount() {
        if (!supabaseClient) return null;

        try {
            const { data, error } = await supabaseClient.rpc('get_waitlist_count');

            if (error) {
                console.warn("[Enrollaa] Could not fetch count via RPC from Supabase:", error.message || error);
                return null;
            }

            if (typeof data === 'number') {
                return data;
            }
            return null;
        } catch (err) {
            console.warn("[Enrollaa] Exception fetching Supabase count RPC:", err.message || err);
            return null;
        }
    }

    async function refreshHeadcountDisplay() {
        const isHomePage = window.location.pathname.endsWith("index.html") || 
                           window.location.pathname === "/" || 
                           window.location.pathname === "" ||
                           !window.location.pathname.includes("waitlist.html");

        const countElements = document.querySelectorAll(".headcount-text");

        const count = await fetchWaitlistCount();
        currentWaitlistCount = count;

        const text = formatWaitlistText(count, isHomePage);
        countElements.forEach(el => {
            el.textContent = text;
        });

        updateAvatarDisplay(count);
    }

    // Refresh count on load
    refreshHeadcountDisplay();

    // Periodic avatar shuffle if count > 0
    setInterval(() => {
        if (currentWaitlistCount !== null && currentWaitlistCount > 0) {
            updateAvatarDisplay(currentWaitlistCount);
        }
    }, 7000);

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
                    throw new Error("Database service is currently unreachable. Please verify your internet connection or database configuration.");
                }

                // Insert directly to database (Postgres enforces unique constraint on email securely)
                const { data, error } = await supabaseClient
                    .from('waitlist')
                    .insert([{
                        name: fullName,
                        email: email.toLowerCase(),
                        phone: phone || null,
                        jamb_candidate: (isJamb === 'yes')
                    }]);

                if (error) {
                    // Unique constraint violation (duplicate email)
                    if (error.code === '23505' || (error.message && (error.message.includes('unique') || error.message.includes('already exists')))) {
                        showFieldError("email", "This email is already registered on the waitlist!");
                        submitBtn.disabled = false;
                        submitBtn.textContent = originalBtnText;
                        return;
                    }
                    console.error("[Enrollaa] Supabase insert details error:", error);
                    throw error;
                }

                // Increment count and update display live
                if (typeof currentWaitlistCount === 'number') {
                    currentWaitlistCount += 1;
                }
                refreshHeadcountDisplay();

                // Trigger Edge Function to send welcome email after successful insert
                try {
                    console.log("[Enrollaa] Invoking send-welcome-email via Supabase client...");

                    const { data: fnData, error: fnError } = await supabaseClient.functions.invoke(
                        'send-welcome-email',
                        {
                            body: { name: fullName, email: email.toLowerCase() }
                        }
                    );

                    if (fnError) {
                        console.error("[Enrollaa] Edge Function error:", fnError.message || fnError);
                    } else {
                        console.log("[Enrollaa] Edge Function success:", fnData);
                    }
                } catch (fnErr) {
                    console.error("[Enrollaa] Edge Function exception:", fnErr.message);
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
                console.error("[Enrollaa] Failed to submit waitlist form:", err);
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
