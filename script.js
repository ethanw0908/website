const header = document.querySelector("[data-header]");
const form = document.querySelector("#waitlist-form");
const roleInput = document.querySelector("#role");
const roleOptions = [...document.querySelectorAll("[data-role]")];
const roleLinks = [...document.querySelectorAll("[data-role-link]")];
const formStatus = document.querySelector("#form-status");
const submitButton = form?.querySelector('button[type="submit"]');
const buttonLabel = submitButton?.querySelector(".button-label");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion) document.documentElement.style.scrollBehavior = "smooth";

// FormSubmit sends each valid signup to the public contact email associated
// with this project. The first submission may trigger a one-time activation email.
const SIGNUP_ENDPOINT = "https://formsubmit.co/ajax/ethan.wang@nyu.edu";

const roleButtonCopy = {
  "I need compute": "Join the private beta",
  "I have compute": "Apply as a provider",
};

function selectRole(role) {
  if (!roleInput || !roleButtonCopy[role]) return;

  roleInput.value = role;
  roleOptions.forEach((option) => {
    const isActive = option.dataset.role === role;
    option.classList.toggle("is-active", isActive);
    option.setAttribute("aria-pressed", String(isActive));
  });

  if (buttonLabel) buttonLabel.textContent = roleButtonCopy[role];
}

roleOptions.forEach((option) => {
  option.setAttribute("aria-pressed", String(option.classList.contains("is-active")));
  option.addEventListener("click", () => selectRole(option.dataset.role));
});

roleLinks.forEach((link) => {
  link.addEventListener("click", () => selectRole(link.dataset.roleLink));
});

window.addEventListener(
  "scroll",
  () => header?.classList.toggle("is-scrolled", window.scrollY > 12),
  { passive: true },
);

const revealElements = [...document.querySelectorAll(".reveal")];

if (reduceMotion || !("IntersectionObserver" in window)) {
  revealElements.forEach((element) => element.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px" },
  );

  revealElements.forEach((element) => revealObserver.observe(element));
}

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

function setStatus(message, type = "") {
  if (!formStatus) return;
  formStatus.textContent = message;
  formStatus.className = `form-status${type ? ` is-${type}` : ""}`;
}

function validateForm() {
  const requiredFields = [...form.querySelectorAll("[required]")];
  let firstInvalid = null;

  requiredFields.forEach((field) => {
    const isValid = field.checkValidity();
    field.classList.toggle("is-invalid", !isValid);
    if (!isValid && !firstInvalid) firstInvalid = field;
  });

  if (firstInvalid) {
    firstInvalid.focus();
    setStatus("Please enter your name and a valid email address.", "error");
    return false;
  }

  return true;
}

form?.querySelectorAll("input, textarea").forEach((field) => {
  field.addEventListener("input", () => field.classList.remove("is-invalid"));
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");

  if (!validateForm()) return;

  const formData = new FormData(form);
  if (formData.get("company_website")) return;

  formData.append("_subject", `New Rete beta signup — ${formData.get("role")}`);
  formData.append("_template", "table");
  formData.append("_captcha", "false");
  formData.delete("company_website");

  submitButton.disabled = true;
  const originalLabel = buttonLabel.textContent;
  buttonLabel.textContent = "Sending…";

  try {
    const response = await fetch(SIGNUP_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
    });

    if (!response.ok) throw new Error(`Signup request failed with ${response.status}`);

    form.reset();
    selectRole("I need compute");
    setStatus("You’re on the list. We’ll contact you as beta capacity opens.", "success");
  } catch (error) {
    console.error(error);
    setStatus(
      "The signup could not be sent. Please try again in a moment or email ethan.wang@nyu.edu.",
      "error",
    );
  } finally {
    submitButton.disabled = false;
    if (!formStatus.classList.contains("is-success")) buttonLabel.textContent = originalLabel;
  }
});
