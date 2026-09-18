const $ = (id) => document.getElementById(id);

const questions = [
  {
    id: "children",
    kicker: "Your household",
    title: "Will the dog live with children?",
    help: "NorSled’s published policy does not permit adoptions to homes with children under 8.",
    options: [
      ["none", "No children", "No children live in the household"],
      ["8-12", "Children ages 8–12", "Compatibility still needs staff confirmation"],
      ["teens", "Teenagers", "Children are 13 or older"],
      ["under8", "A child under 8", "We’ll explain NorSled’s current policy"],
    ],
  },
  {
    id: "pets",
    kicker: "Other animals",
    title: "What other animals live in your home?",
    help: "Profile compatibility can be incomplete, so NorSled will always confirm this directly.",
    options: [
      ["none", "No other animals", "The dog would be your only pet"],
      ["dogs", "One or more dogs", "A meet-and-greet will still be important"],
      ["cats", "Cats or small animals", "Includes rabbits, birds and similar pets"],
      ["dogs-cats", "Dogs and cats", "Both types live in the household"],
    ],
  },
  {
    id: "activity",
    kicker: "Daily life",
    title: "What activity level fits you best?",
    help: "Choose what you can provide consistently—not only on your most active days.",
    options: [
      ["low", "Low-key companion", "Casual walks and plenty of time at home"],
      ["moderate", "Daily walks", "Regular walks and weekend activities"],
      ["high", "Very active", "Running, hiking or substantial daily exercise"],
    ],
  },
  {
    id: "weight",
    kicker: "Dog size",
    title: "Do you have a weight limit?",
    help: "Weights are approximate and may change, particularly for younger dogs.",
    options: [
      ["50", "Up to 50 lb", "Smaller available dogs only"],
      ["60", "Up to 60 lb", "Medium-sized dogs"],
      ["75", "Up to 75 lb", "Most huskies and similar dogs"],
      ["none", "No weight limit", "Size is flexible"],
    ],
  },
  {
    id: "age",
    kicker: "Dog age",
    title: "What age dog would you prefer?",
    help: "This is a preference, not a strict filter. Age and energy level do not always match exactly.",
    options: [
      ["any", "No preference", "I’m open to dogs of any age"],
      ["puppy", "Puppy", "Under 1 year old"],
      ["young", "Young adult", "About 1–3 years old"],
      ["adult", "Adult", "About 4–7 years old"],
      ["senior", "Senior", "About 8 years or older"],
    ],
  },
  {
    id: "sex",
    kicker: "Dog sex",
    title: "Do you have a preference for the dog’s sex?",
    help: "Choose no preference if either a male or female dog could be a good fit.",
    options: [
      ["any", "No preference", "Either male or female"],
      ["female", "Female", "I would prefer a female dog"],
      ["male", "Male", "I would prefer a male dog"],
    ],
  },
  {
    id: "home",
    kicker: "Your home",
    title: "What outdoor setup do you have?",
    help: "The public profiles currently list a yard and six-foot fence for many dogs.",
    options: [
      ["secure", "Yard with a 6-foot fence", "Secure enclosed outdoor space"],
      ["yard", "Yard with a lower fence", "Fence requirements need discussion"],
      ["none", "No private yard", "Apartment, condo or yard-free home"],
    ],
  },
  {
    id: "experience",
    kicker: "Your experience",
    title: "Have you lived with a Nordic breed before?",
    help: "Many profiles request breed experience because huskies can be vocal, prey-driven and skilled escape artists.",
    options: [
      ["yes", "Yes", "I have Nordic-breed experience"],
      ["dogs", "Dog experience, but not Nordic breeds", "I understand general dog care and training"],
      ["first", "First-time dog owner", "I would need additional guidance"],
    ],
  },
];

let dogs = [];
let currentQuestion = 0;
const answers = {};
const savedMatchKey = "norsled-adoption-match";

function traitIncludes(dog, phrase) {
  return dog.traits.some((trait) => trait.toLowerCase().includes(phrase.toLowerCase()));
}

function dogFacts(dog) {
  const description = dog.description.toLowerCase();
  let activity = "moderate";
  if (["Blue", "Blaze", "Cloud"].includes(dog.name)) activity = "low";
  if (description.includes("very active") || description.includes("running partner")) activity = "high";
  return {
    cats: traitIncludes(dog, "good with cats") && !traitIncludes(dog, "not good with cats"),
    catsNo: traitIncludes(dog, "not good with cats"),
    dogs: traitIncludes(dog, "good with dogs") || description.includes("dog-friendly"),
    kids: traitIncludes(dog, "good with kids") || description.includes("children"),
    houseTrained: traitIncludes(dog, "house trained") || description.includes("potty trained"),
    quiet: traitIncludes(dog, "vocalize: quiet") || description.includes("isn't much of a barker"),
    yard: traitIncludes(dog, "yard required"),
    fence6: traitIncludes(dog, "requires fence: 6 foot"),
    breedExperience: traitIncludes(dog, "owner experience needed: breed"),
    activity,
    special: dog.name === "Blaze" ? "Three-legged; the profile says he is fully healed, but staff should confirm his individual exercise needs." : null,
    behavior: dog.name === "Buck" ? "The profile notes reactivity to unfamiliar small dogs and previously improved resource guarding." : null,
  };
}

function ageGroup(ageText) {
  const years = Number(ageText.match(/(\d+)\s+Year/i)?.[1] || 0);
  const months = Number(ageText.match(/(\d+)\s+Month/i)?.[1] || 0);
  const ageInYears = years + (months / 12);
  if (ageInYears < 1) return "puppy";
  if (ageInYears < 4) return "young";
  if (ageInYears < 8) return "adult";
  return "senior";
}

function evaluateDog(dog) {
  const facts = dogFacts(dog);
  let score = 50;
  const reasons = [];
  const considerations = [];

  const maxWeight = answers.weight === "none" ? Infinity : Number(answers.weight);
  if (Number(dog.weight) > maxWeight) return null;

  if (answers.age !== "any") {
    if (ageGroup(dog.age) !== answers.age) return null;
    score += 12;
    reasons.push(`Age fits your preference (${dog.age.toLowerCase()})`);
  }

  if (answers.sex !== "any") {
    if (dog.gender.toLowerCase() !== answers.sex) return null;
    score += 10;
    reasons.push(`${dog.gender} dog, matching your preference`);
  }

  if (["dogs", "dogs-cats"].includes(answers.pets)) {
    if (facts.dogs) { score += 14; reasons.push("Profile indicates compatibility with other dogs"); }
    else considerations.push("Compatibility with other dogs is not confirmed");
  } else if (answers.pets === "none") {
    reasons.push("Could be considered for a home without other animals");
  }

  if (["8-12", "teens"].includes(answers.children)) {
    if (facts.kids) { score += 12; reasons.push("Profile mentions being good with children"); }
    else considerations.push("Child compatibility is not stated in the public profile");
  }

  if (answers.activity === facts.activity) {
    score += 16;
    reasons.push(answers.activity === "low" ? "Profile suggests a calmer day-to-day companion" : "Reported activity level aligns with regular daily walks");
  } else if (answers.activity === "high" && facts.activity === "moderate") {
    score += 7;
    reasons.push("Moderate activity needs may fit an active household");
  } else if (answers.activity === "low" && facts.activity === "moderate") {
    score -= 9;
    considerations.push("The profile lists moderate activity and exercise needs");
  }

  if (answers.home === "secure" && facts.fence6) {
    score += 10;
    reasons.push("Your outdoor setup matches the listed six-foot fence requirement");
  } else if (facts.yard) {
    score -= answers.home === "none" ? 12 : 5;
    considerations.push("The profile currently lists a yard and six-foot fence requirement");
  }

  if (answers.experience === "yes") {
    score += 8;
    reasons.push("Your Nordic-breed experience matches the profile requirement");
  } else if (facts.breedExperience) {
    score -= answers.experience === "first" ? 12 : 6;
    considerations.push("The profile requests an adopter with Nordic-breed experience");
  }

  if (facts.houseTrained) reasons.push("Profile reports house or potty training");
  if (facts.quiet) reasons.push("Profile specifically describes this dog as relatively quiet");
  if (facts.special) considerations.push(facts.special);
  if (facts.behavior) considerations.push(facts.behavior);
  if (!facts.kids && answers.children === "none") considerations.push("Child compatibility is not documented");
  considerations.push("Barking and alone-time tolerance are not consistently documented");

  return { dog, score: Math.max(0, Math.min(100, score)), reasons: reasons.slice(0, 3), considerations: considerations.slice(0, 3) };
}

function policyBlock() {
  if (answers.children === "under8") {
    return {
      title: "The current adoption policy may prevent a match",
      message: "NorSled’s published adoption process says it does not adopt to families with children under 8. Please contact NorSled if you have questions about your circumstances.",
    };
  }
  if (["cats", "dogs-cats"].includes(answers.pets)) {
    return {
      title: "No safe profile match based on current information",
      message: "The sampled public profiles say the dogs are not good with cats, and NorSled’s published policy excludes homes with small or farm animals. Please confirm directly with NorSled because policies and individual assessments can change.",
    };
  }
  return null;
}

function renderQuestion() {
  const question = questions[currentQuestion];
  const progress = ((currentQuestion + 1) / questions.length) * 100;
  $("progress-label").textContent = `Question ${currentQuestion + 1} of ${questions.length}`;
  $("progress-percent").textContent = `${Math.round(progress)}%`;
  $("progress-bar").style.width = `${progress}%`;
  $("question-kicker").textContent = question.kicker;
  $("question-title").textContent = question.title;
  $("question-help").textContent = question.help;
  $("back-btn").style.visibility = currentQuestion ? "visible" : "hidden";
  $("next-btn").textContent = currentQuestion === questions.length - 1 ? "See matches" : "Continue";
  $("next-btn").disabled = !answers[question.id];

  const list = $("answer-list");
  list.innerHTML = "";
  question.options.forEach(([value, title, description]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `answer-option ${answers[question.id] === value ? "selected" : ""}`;
    button.innerHTML = `<strong>${title}</strong><span>${description}</span>`;
    button.addEventListener("click", () => {
      answers[question.id] = value;
      renderQuestion();
    });
    list.appendChild(button);
  });
}

function matchCard(result, index) {
  const { dog, score, reasons, considerations } = result;
  const article = document.createElement("article");
  article.className = "match-card";
  const label = index === 0 && score >= 70 ? "Strong match" : "Possible match";
  const reasonItems = reasons.length ? reasons : ["Matches your selected size range"];
  article.innerHTML = `
    <img class="dog-photo" src="${dog.image}" alt="${dog.name}, an adoptable ${dog.breed}" loading="lazy" />
    <div class="match-content">
      <div class="match-top">
        <div><h3>${dog.name}</h3><p class="dog-meta">${dog.age} • ${dog.weight} lb • ${dog.gender}</p></div>
        <span class="match-label">${label}</span>
      </div>
      <div class="reason-group">
        <div><h4>Why ${dog.name} may fit</h4><ul>${reasonItems.map((item) => `<li>${item}</li>`).join("")}</ul></div>
        <div><h4>Confirm with NorSled</h4><ul>${considerations.map((item) => `<li>${item}</li>`).join("")}</ul></div>
      </div>
      <a class="profile-link" href="/dog.html?id=${encodeURIComponent(dog.id)}&from=matches">View ${dog.name}’s profile&nbsp; →</a>
    </div>`;
  return article;
}

function showResults() {
  sessionStorage.setItem(savedMatchKey, JSON.stringify(answers));
  history.replaceState(null, "", "/match.html#results");
  $("matcher").classList.add("hidden");
  $("results").classList.remove("hidden");
  const notice = $("policy-notice");
  const blocked = policyBlock();
  const list = $("match-list");
  list.innerHTML = "";

  if (blocked) {
    notice.classList.remove("hidden");
    notice.innerHTML = `<strong>${blocked.title}</strong>${blocked.message}`;
    $("results-title").textContent = "Let’s check with NorSled";
    $("results-summary").textContent = "The assistant will not recommend a dog when current policy or profile information indicates a potential incompatibility.";
    list.innerHTML = '<div class="no-match"><h3>No automated recommendation</h3><p>A NorSled adoption coordinator can provide the safest and most current guidance.</p></div>';
  } else {
    notice.classList.add("hidden");
    const matches = dogs.map(evaluateDog).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 3);
    $("results-title").textContent = matches.length ? "Possible matches" : "No matches within those preferences";
    $("results-summary").textContent = matches.length
      ? "These dogs appear closest to your preferences based on their current public profiles. Open each profile and discuss the details with NorSled."
      : "Try adjusting the weight limit or contact NorSled for dogs whose profiles may not yet be published.";
    matches.forEach((result, index) => list.appendChild(matchCard(result, index)));
    if (!matches.length) list.innerHTML = '<div class="no-match"><h3>No current profile match</h3><p>This does not mean NorSled cannot help—new dogs arrive and profiles change regularly.</p></div>';
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function restart() {
  sessionStorage.removeItem(savedMatchKey);
  history.replaceState(null, "", "/match.html");
  Object.keys(answers).forEach((key) => delete answers[key]);
  currentQuestion = 0;
  $("results").classList.add("hidden");
  $("matcher").classList.remove("hidden");
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("start-btn").addEventListener("click", () => {
  $("intro").classList.add("hidden");
  $("matcher").classList.remove("hidden");
  renderQuestion();
});
$("back-btn").addEventListener("click", () => { if (currentQuestion) { currentQuestion -= 1; renderQuestion(); } });
$("next-btn").addEventListener("click", () => {
  if (!answers[questions[currentQuestion].id]) return;
  if (currentQuestion === questions.length - 1) showResults();
  else { currentQuestion += 1; renderQuestion(); }
});
$("restart-btn").addEventListener("click", restart);

fetch("/adoption-dogs.json", { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error("Could not load dog profiles.");
    return response.json();
  })
  .then((data) => {
    dogs = data;
    if (window.location.hash === "#results") {
      try {
        const savedAnswers = JSON.parse(sessionStorage.getItem(savedMatchKey));
        if (savedAnswers && questions.every((question) => savedAnswers[question.id])) {
          Object.assign(answers, savedAnswers);
          $("intro").classList.add("hidden");
          showResults();
        }
      } catch {
        sessionStorage.removeItem(savedMatchKey);
      }
    }
  })
  .catch(() => {
    $("start-btn").disabled = true;
    $("start-btn").textContent = "Profiles temporarily unavailable";
  });
