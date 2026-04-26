# Podbit: Synthesis Node Registry

*Reviewed synthesis nodes with status classifications and external convergences.*
*Last updated: April 2026*

---

## 1. The Materials Science Triad

Three nodes from materials science that form a complete theory of sparse neural network training. Each addresses a different aspect: mechanism, strength, and resilience.

### 1.1 Martensitic Phase Transitions in Neural Networks

**Core claim:** Neural networks traverse discrete lock-in states via cooperative weight reconfiguration analogous to martensitic phase transformations in steel. LR spikes trigger coordinated mask avalanches, not gradual independent flips.

**Key evidence:** Experimental confirmation on MNIST/MLP with dual Arc A770 GPUs. 20 seeds across multiple spike magnitudes. Three regimes identified: pre-spike trickle, spike-triggered avalanche (up to 1827x acceleration in mask flip rate), post-spike freeze. Steering boundary quantified: 2.0x safe, 2.5x critical, >3.0x catastrophic collapse.

**Mathematical verification:** Four-test suite passed: lock_in_states_exist, strain_independent_of_mask, hysteresis_possible, strength_from_strain_not_just_composition. Confidence capped at 0.5 (analogy verification, not empirical proof).

**Status:** **CONFIRMED** - experimental data on MNIST/MLP, 20 seeds, quantified regimes.

**Testable prediction:** Sequential controlled hops at 2.0-2.5x can safely reach high sparsity levels that single large spikes cannot achieve (Devil's Staircase climbing).

### 1.2 Coherency Strain Strengthening

**Core claim:** Optimal sparse neural structures rely on distributed tension (strain) between sub-networks rather than simply pruning weights to zero. Remaining weights are under productive tension from the absence of neighbours, analogous to coherency strain in precipitation-hardened aerospace alloys.

**Key insight:** Explains why 35% sparsity maintains 97% accuracy. The zeros create elastic distortion in surrounding weight space. Active weights work harder, stretched by absence. Sparsity is not just removing redundancy but creating a stress field that strengthens what remains.

**Prediction:** Random pruning to equivalent sparsity will perform worse because it does not create coherent strain fields. Martensitic avalanche creates aligned patterns; gradual pruning creates incoherent removal.

**Status:** **HYPOTHESIS** - consistent with experimental results, not independently tested.

### 1.3 Grain Boundary Engineering for Adversarial Robustness

**Core claim:** Introducing high fraction of low-energy special boundaries (coherent twins) disrupts percolation path of intergranular cracks. Maps to adversarial robustness: special boundaries from martensitic transition disrupt adversarial attack propagation.

**Prediction:** Networks trained via martensitic protocol will show better adversarial robustness than conventionally pruned networks at equivalent sparsity, without any explicit robustness training.

**Status:** **HYPOTHESIS** - untested prediction, follows from triad logic.

**Combined theory:** Faster training (martensitic transitions), stronger sparse networks (coherency strain), better adversarial robustness (grain boundary engineering). All from one training protocol. Only 1.1 experimentally confirmed; 1.2 and 1.3 are predictions.

---

## 2. Thermodynamic Framework Nodes

### 2.1 Phonon-Glass Electron-Crystal (PGEC) Batch Splitting

**Core claim:** Segregating neural parameters into framework (large-batch, low temperature, clean gradient flow) and rattler (small-batch, high temperature, noise absorption) groups implements the PGEC thermoelectric decoupling principle. Optimal training requires heterogeneous local temperatures, not uniform global control.

**Grounding:** K7 node empirically establishes that networks with hot slow modes and cold fast modes generalise better. PGEC provides the design principle for engineering this heterogeneity deliberately.

**Prediction:** Train same architecture with uniform batch size vs PGEC-split (large for backbone, small for auxiliary). PGEC-split will show superior generalisation.

**Status:** **HYPOTHESIS** - testable on current hardware, not yet tested.

### 2.2 PGEC + May's Stability Criterion

**Core claim:** Network stability during scaling can be achieved by introducing anharmonic rattler perturbations to lower effective interaction strength sigma, rather than reducing connectance C. Embeds noise-absorbing parameters that dampen effective interaction strength without removing connections.

**Key insight:** Reframes the scaling problem. Convention says scaling requires sparsity. This says scaling is achievable through heterogeneous noise injection keeping sigma bounded while N and C stay large.

**Gap identified:** Node should address the cost of rattler parameters (compute, memory, convergence speed). Also needs to specify what neural network anharmonicity means vs simple Gaussian noise.

**Status:** **HYPOTHESIS** - plausible synthesis, gaps in anharmonicity definition.

### 2.3 Thermodynamic Speed Limits

**Core claim:** Geometric speed limits from stochastic thermodynamics establish a fundamental trade-off between training trajectory speed and entropy production. Converging too rapidly forces high-dissipation regimes that destroy generalisation.

**Grounding:** Thermodynamic uncertainty relations (Shiraishi et al. 2018), SGD-Langevin connection (Mandt et al. 2017), sharpness-generalisation connection (Keskar et al.) all documented. Novel step: geometric speed limit as hard bound on generalisation.

**Status:** **HYPOTHESIS** - substrate real, direction consistent, falsifiable.

### 2.4 Structured Topology Beyond May's Framework

**Core claim:** Structured sparsity patterns like 2:4 operate under different spectral constraints than random matrices. May's circular law bounds apply strictly to random structures; non-random architecture actively suppresses instability. Evidence from nested mutualistic networks: 40-60% lower secondary extinction rates vs random matrices at identical connectance.

**Key insight:** Identifies genuine gap: random matrix tools applied to non-random structures give bounds that may be too loose or too tight. The hard problem (what replaces May's framework) is correctly left open.

**Status:** **HYPOTHESIS** - well-grounded, correctly scoped, untested.

### 2.5 Minimum Batch Size from May's Stability Bound

**Core claim:** Mapping SGD effective temperature onto May's interaction strength variance reveals that minimum stable batch size scales linearly with the product of network width and connectance. Large dense networks cannot leverage small-batch exploration without violating stability thresholds.

**Parent nodes:** Child of May's stability criterion (2.4) and batch-temperature scaling (K9). Neither parent makes this claim alone.

**Novel content:** May says sigma*sqrt(NC) < 1. Temperature relation says T_eff proportional to eta/B. Connecting them: B has a lower bound determined by network topology. This may explain the empirical observation that large models need large batches to train stably, a known fact without prior theoretical derivation from a stability criterion.

**Prediction:** Train same architecture at increasing width, find minimum stable batch size (no loss oscillation), plot against N*C. If relationship is linear, the May-temperature mapping is confirmed.

**Caveat:** Mapping of sigma (interaction matrix property) to T_eff (optimiser property) is asserted not derived. Both measure system randomness but enter their equations differently. Linear scaling prediction may be approximate rather than exact. Additionally, T_eff ∝ eta/B derives from Langevin approximation (Mandt et al. 2017) valid near convergence at small learning rates, exactly the opposite regime from the small-B exploration this node invokes.

**Status:** **HYPOTHESIS** - non-obvious prediction from established parents, falsifiable, caveat on sigma-T mapping.

### 2.5a Computational Verification: Batch Size Phase Transition

**Verification of:** Node 2.5 (minimum batch size from May's stability bound)

**Model tested:** alpha_eff = alpha_base + k_thermal/B, where reducing batch size B elevates effective interaction strength alpha beyond May's critical threshold.

**Simulation parameters:** S=200 species/neurons, C=0.8 connectance, batch size swept from B=1024 to B=1.

**Results:** Monotonic risk increase confirmed. Stable at B=1024 (metric below threshold). Sharp phase transition at B=256 (metric=1.154, exceeding critical threshold of 1.0). Severe disorder at B=1 (metric=101.95). Transition is discontinuous, not gradual.

**Implication:** Dense non-modular architectures have a hard lower bound on batch size enforced by random matrix theory. For S=200, C=0.8 (NC=160), critical B=256. This quantifies the scaling relationship predicted by node 2.5.

**Ecology extension:** Thermal noise / environmental variance can independently destabilise an ecosystem, stability depends on thermodynamic energy driving interaction strengths, not only static richness or connectance.

**Caveat - Langevin validity:** The parent node's T_eff = eta/B scaling derives from the Langevin approximation of SGD (Mandt et al. 2017), which holds under small learning rate near convergence. The phase transition predicted here occurs at small B (high T_eff), precisely the regime where Langevin is least valid. The EVM verification confirmed the formula's arithmetic (T_eff doubles when B halves) at confidence 0.95, but this is an ARITHMETIC check not an EMPIRICAL one. Whether real SGD dynamics at B=1-256 behave as the Langevin model predicts is the open question.

**Status:** **HYPOTHESIS** - formula-confirms-formula. Langevin validity at low B is the untested assumption. Needs real training runs to upgrade.

### 2.6 Storage Effect: Cyclical Batch Scheduling as Ecological Coexistence

**Core claim:** Dynamic batch scheduling functions as temporal environmental variation required by the ecological Storage Effect, enabling stable coexistence of multiple local minima within a single network. EMA weight averaging acts as a biological seed bank, preserving solution pathways through hostile temperature regimes.

**Novel content:** Provides a mechanistic explanation for why cyclical learning rate and batch size schedules work (Smith 2017, super-convergence). Cyclical schedules maintain diversity of solution pathways by preventing competitive exclusion of minority minima. Static schedules are constant environments leading to mode collapse (one minimum wins).

**Key insight:** EMA-as-seed-bank. Polyak averaging / SWA is standard practice without principled explanation. Storage Effect framing explains WHY it works: buffered population storage preserving solutions through hostile temperature regimes. The covariance between environment (batch size) and competitive response (which minima benefit) drives coexistence.

**Prediction:** Three-way comparison: cyclical batch + EMA vs static batch + EMA vs cyclical batch without EMA. Storage Effect predicts full combination outperforms either component alone. Measure solution diversity (gradient update variance, distinct minima visited). Need both variation AND buffer.

**Status:** **HYPOTHESIS** - mechanistic explanation for known phenomenon, three-way test designed but not run.

**Empirical grounding (MoE expert collapse):** Competitive exclusion in mixture-of-experts becomes effectively irreversible after the early-specialisation phase, when a single expert captures the gating signal and gradient noise can no longer maintain alternatives. This is the documented failure mode (expert/routing collapse in Shazeer et al., Switch Transformer, ST-MoE) that the Storage Effect hypothesis proposes to solve. Auxiliary diversity losses delay but do not guarantee avoidance of exclusion, consistent with the Storage Effect prediction that static environmental conditions permit competitive exclusion regardless of load-balancing penalties. The cyclical batch + EMA protocol prescribed by this node directly addresses the mechanism: temporal variation prevents lock-in, seed-bank buffering preserves dormant experts through hostile routing regimes.

### 2.7 Critical Batch Size for Gradient Noise Suppression (EVM Recovery)

**Node ID:** `70b6b7cf-4446-4315-83bf-c0c4c2263223`

**Origin:** EVM recovery from a rejected claim that adaptive optimizers (Adam) flatten Hessian spectra and eliminate anisotropic gradient noise, predicting SGD converges to flatter minima than Adam at large batch sizes. The EVM disproved this on synthetic quadratic landscapes and discovered a more fundamental result.

**Core finding:** In synthetic quadratic landscapes, both Adam and SGD sample the same Hessian curvature because curvature is a property of the loss surface geometry, not the optimizer. The predicted flat-vs-sharp minima distinction does not emerge, both optimizers converge identically (ratio ≈ infinity). The flat-vs-sharp distinction requires non-convex landscapes with multiple local minima, which synthetic quadratics lack.

**Quantitative result:** Critical batch size for gradient noise suppression scales as B_crit = (η/σ_escape)², where η is learning rate and σ_escape is the escape threshold. For η=0.01 and escape threshold 0.001, B_crit ≈ 100. The effective diffusion coefficient scales as η/√B for both optimizers. Above B_crit, gradient noise is suppressed below the level needed to escape local minima, regardless of optimizer choice.

**Relationship to 2.5:** Node 2.5 derives minimum batch size from May's stability bound (ecological stability criterion mapped to SGD dynamics). This node derives critical batch size from gradient noise suppression (escape threshold in loss landscape). Different derivation paths, same territory: both establish that batch size has a structurally determined lower bound related to network properties. Node 2.5 gives B_min from stability (can't go below without instability). This node gives B_crit from escape (can't go above without trapping). Together they define a feasible batch size window.

**Key insight:** Curvature is landscape geometry, not optimizer behaviour. This means optimizer comparisons on synthetic quadratics are fundamentally limited, the landscape determines the Hessian, and both optimizers see the same one. Optimizer-dependent curvature effects only emerge in non-convex settings with multiple basins where different optimizers can settle into different minima. This has implications for experimental design: testing optimizer effects on curvature requires non-convex benchmarks, not synthetic quadratics.

**Caveat:** The B_crit formula is derived from quadratic landscape assumptions. Real neural network loss surfaces are non-convex with complex basin structure, so the formula is a lower-order approximation. The qualitative insight (batch size controls escape capability) transfers; the exact scaling may not.

**Status:** **VERIFIED (EVM recovery)** - B_crit formula confirmed on synthetic landscapes at 92% confidence. Qualitative insight about curvature as landscape property is general. Quantitative scaling needs validation on real networks. March 2026.

---

## 3. High-Value Tension Nodes

### 3.1 DPI vs Stochastic Resonance (#1)

**Core insight:** Resolves apparent contradiction by identifying that DPI and stochastic resonance operate on different variables: mutual information with labels vs gradient variance.

**Prediction:** Noise benefit scales with gap from DPI bound.

**Status:** **HYPOTHESIS** - experimentally tractable, not yet tested.

### 3.2 Multigrid/Sparsity (#9)

**Core insight:** Sparse networks implement implicit multigrid structure, with sparsity as learned coarsening rather than prescribed.

**Prediction:** Depth-proportional sparsity curricula will outperform uniform sparsity schedules.

**Status:** **HYPOTHESIS** - untested, prediction is specific and falsifiable.

### 3.3 Loss Variance Peaks as Information (#10)

**Core insight:** Reframes variance peaks during training as information rather than noise. Residual connections spread transitions rather than removing them.

**Status:** **HYPOTHESIS** - reframing with diagnostic potential, not validated.

### 3.4 RIP + Stochastic Resonance + Structured Sparsity

**Core claim:** Structured sparsity masks that preserve the Restricted Isometry Property enforce combinatorial regularities which, combined with optimal non-zero noise levels from stochastic resonance, yield stable gradient flow robust to dropout-induced perturbations.

**Prediction:** Networks using 2:4 structured pruning with dropout rates tuned to the peak of stochastic resonance will exhibit lower test loss than those with either random sparsity or zero-dropout.

**External convergence:** 'Efficient and dynamic layer-wise structured N:M pruning of deep neural networks' (ScienceDirect) independently confirms structured masks outperform random at equivalent sparsity with dynamic layer-wise allocation.

**What Podbit adds beyond published work:** The stochastic resonance angle: there exists an optimal non-zero dropout rate determined by the resonance peak of the structured mask. This specific prediction is not covered in the published literature.

**Status:** **CONVERGED** - direction validated by published work, extension prediction untested.

### 3.5 Mesh Peclet Instability as Spinodal Decomposition Trigger

**Core claim:** The oscillatory instability when mesh Peclet number exceeds 2 (central-differencing breakdown) functions as the computational analogue of the thermodynamic condition for spinodal decomposition. Exceeding the Peclet stability threshold does not simply corrupt training but initiates a barrier-less phase transition where infinitesimal weight fluctuations spontaneously coalesce into sparse sub-networks.

**Key insight:** Reframes numerical instability as a phase transition mechanism rather than an artifact to be suppressed. When gradient velocity dominates regularisation viscosity, the system enters a spinodal regime where sparsity emerges spontaneously without discrete nucleation or explicit pruning constraints.

**Prediction:** Networks trained with effective Peclet number deliberately pushed above the critical threshold (high learning rate relative to weight decay) will exhibit spontaneous co-continuous sparse structure formation, bypassing the need for explicit sparsity-inducing regularisation.

**Connection to triad:** Complements the martensitic transition mechanism (Section 1.1) by providing an alternative pathway to sparsity: nucleation-driven (martensitic) vs barrier-less (spinodal). Both are legitimate phase transition routes in materials science with different microstructural outcomes.

**Status:** **HYPOTHESIS** - mechanistic, falsifiable, untested.

### 3.6 TRIP-Like Phase Transition via Peclet Instability

**Core claim:** Exceeding the critical Peclet number can be deliberately exploited as a computational stressor to induce TRIP-like (Transformation-Induced Plasticity) phase transitions in neural network weights. The oscillatory breach of diagonal dominance triggers weight-space strain-hardening analogous to retained austenite transforming to martensite during deformation, delaying convergence failure.

**Parent nodes:** Child of Peclet/spinodal node (3.5) and the martensitic triad (Section 1). Parent identifies the mechanism; this child identifies the function.

**Key insight:** In TRIP steel, retained austenite transforms during deformation, not cooling. The transformation absorbs energy at the failure point, delaying necking. In training: Peclet instability triggers local weight restructuring at exactly the point where optimisation would stall, providing fresh capacity when the current configuration is exhausted.

**Considere criterion mapping:** In materials, necking onset occurs when work hardening rate equals stress. In training, the analogue is when rate of loss improvement equals current loss (diminishing returns onset). TRIP-like transformation delays this by injecting structural reorganisation at the stagnation point.

**Prediction:** Networks with deliberately induced Peclet instability at detected stagnation points will show delayed onset of diminishing returns compared to networks with uniform regularisation throughout training.

**Note:** The 3-4% martensitic volume expansion figure is specific to steel. Neural network analogue (effective parameter count increase from weight redistribution during transition) needs explicit quantification rather than importing the metallurgical constant.

**Status:** **HYPOTHESIS** - tighter than parent, falsifiable, untested.

---

## 4. Novel Cross-Domain Discoveries

### 4.1 Hornification / Muller's Ratchet

**Core claim:** Irreversible capacity loss through sequential processing without reconciliation is a shared failure mode across textile hornification, evolutionary biology (Muller's Ratchet), and distributed systems (delta-CRDT loss). Processing order is a correctness constraint, not an optimisation choice.

**Novelty check:** Web search confirmed no prior art. Nobody has connected hornification to Muller's Ratchet in published literature.

**Practical application:** Linting rule for pipeline design: identify irreversible steps, verify resource dependencies complete before them.

**Origin:** Noise domain (textile manufacturing). Designed to test quality filters. Produced genuinely novel synthesis instead.

**Status:** **HYPOTHESIS** - no prior art found, actionable, mechanism not empirically tested.

### 4.2 Centromere Drive / Byzantine Fault Tolerance

**Core claim:** Centromere drive and BFT solve the same problem: honest coordination despite self-serving components. Both solve it through redundant verification at the interface layer, not elimination of adversaries. Verification cost scales with attack surface, not number of honest participants.

**Novelty check:** Web search confirmed no prior art.

**Status:** **HYPOTHESIS** - no prior art found, structurally precise, not empirically tested.

### 4.3 Muller's Ratchet / delta-CRDT Delta-Loss

**Core claim:** Asexual population drift (Muller's Ratchet) and delta-CRDT churn loss are the same structural failure mode. Both lack recombination mechanisms. Predicts degradation rate proportional to departure/reconciliation frequency ratio.

**Validation scores:** Synthesis 9, Novelty 7, Testability 7, Tension Resolution 6. Composite 7.3.

**Status:** **HYPOTHESIS** - quantitative prediction, not empirically tested.

### 4.4 Boolean Rank of 2-Sparse Patterns / Loom Shaft Minimality (General Case)

**Core claim:** For any integer n, the Boolean rank of the incidence matrix comprising all 2-sparse binary vectors of length n equals n. This matrix has C(n,2) rows, each corresponding to a unique edge of the complete graph Kₙ, and n columns, one per bit position. An n-shaft loom can generate every 2-sparse pattern by enumerating all C(n,2) two-one patterns, and no fewer shafts suffice. The 2:4 case (K₄, Boolean rank = 4) is the specific instance relevant to NVIDIA hardware.

**Proof sketch:** Upper bound: the n standard basis vectors e₁,...,eₙ provide an n-column factorisation, each 2-sparse pattern is the Boolean OR of exactly two basis vectors. Lower bound: any Boolean factorisation of size r must cover all edges with r stars. By pigeonhole, if r < n then two vertices share the same column pattern in the factor matrix, collapsing distinct edges into identical rows, contradiction. Therefore rank = n exactly.

**Computational verification:** For the K₄ case: exhaustive enumeration of all 4,096 possible 3×4 Boolean factor matrices confirms no rank-3 factorisation exists. Rank-4 factorisation constructed and verified for all 6 patterns. Confidence 0.950 reflecting exhaustive enumeration plus theoretical alignment with known Boolean rank results. Falsifiable: if a constructed loom fails to cover a pattern, rank = n is disproved.

**Cross-domain bridge:** Weaving (shaft-selection mechanism) ↔ Graph theory (edge-vertex incidence of Kₙ) ↔ Sparse hardware (N:M pattern space). The isomorphism is structural, not metaphorical: the loom literally performs Boolean matrix factorisation over the pattern space. The design rule generalises: for any N:M sparsity class, the minimum generator count equals the Boolean rank of the corresponding incidence matrix.

**Novelty assessment:** The Boolean rank of Kₙ incidence matrix = n is classical (Kim 1982). The application to loom shaft minimality and N:M sparsity pattern generation as a unified framework is original. Web search confirmed no prior art for this specific cross-domain connection. Pairs with node 4.5 (NP-completeness of the general case) to form the complete argument: structured sparsity is both sufficient and complexity-theoretically necessary.

**Status:** **VERIFIED** - exhaustive enumeration (K₄) plus theoretical proof (all Kₙ). Confidence 0.950. Classical result; novel cross-domain framework. February 2026.

### 4.5 NP-Completeness of Minimum Loom Shaft Configuration / Biclique Cover

**Core claim:** Determining the minimum loom shaft configuration for arbitrary unstructured sparsity patterns is NP-complete. The calculation is formally equivalent to the Minimum Biclique Cover problem (Garey & Johnson problem GT18, proven by Orlin 1977). The Boolean rank of a binary pattern matrix equals the minimum number of rank-1 Boolean matrices (bicliques) needed to cover it. This is not merely hard but hard to approximate: NP-hard to approximate within n^(1−ε) (Chalermsook et al. 2014).

**Verification:** Grounded in established combinatorial matrix theory. The equivalence chain: binary pattern matrix → Boolean rank → minimum biclique cover of corresponding bipartite graph → NP-complete (via polynomial-time reduction from Set Cover). Confirmed in Czechoslovak Mathematical Journal (2018), Chalermsook et al. ESA 2014, Amilhastre et al. Discrete Applied Mathematics 1998, and Garey & Johnson 1979.

**Practical implications:** This is a "stop looking" theorem. It proves that finding the optimal mask encoding for arbitrary unstructured sparsity is provably intractable. For hardware compilers mapping dense models to sparse tensor cores, this means: (1) optimal mask assignment for unstructured pruning is NP-hard, (2) structured patterns like 2:4 sidestep the complexity wall entirely (K₄ Boolean rank computable in microseconds vs intractable for arbitrary matrices), (3) 2:4 is not a compromise but the correct engineering response to a provably intractable general problem.

**Relationship to 4.4:** Node 4.4 proved that 2:4 structured sparsity is sufficient (Boolean rank = 4 covers all valid patterns). This node proves that going beyond structured patterns to arbitrary unstructured masks is intractable. Together they form the complete argument: structured sparsity is both sufficient for the pattern space and necessary given computational constraints.

**Cross-domain validation:** The weaving industry independently converged on this solution millennia ago: standardising on small shaft counts (4, 8, 16, 32) with fixed tie-up patterns rather than arbitrary per-thread control (Jacquard). The historical convergence on structured block patterns is an empirical validation of the same complexity boundary now proven formally.

**Novelty assessment:** The NP-completeness of Boolean rank/biclique cover is classical (Orlin 1977). The application to sparse hardware compilation and loom shaft minimality as a unified complexity argument is the novel contribution. The framing that structured sparsity is complexity-theoretically necessary (not merely convenient) does not appear in the NVIDIA or PyTorch sparsity literature.

**Status:** **VERIFIED** - grounded in established complexity theory (Garey & Johnson GT18, Orlin 1977, Chalermsook et al. 2014). Classical result; novel cross-domain framing with practical hardware design implications. February 2026.

### 4.6 Stacking Fault Energy Threshold in Grain Boundary Dislocation Character

**Core claim:** The Read-Shockley grain boundary energy parameter A explicitly incorporates stacking fault energy γ_SF when misorientation θ < θ_c ≈ 8πγ_SF/(Gb). Below this critical angle, A decomposes as A = A₀ + αγ_SF·b² (α ≈ 0.1-0.3 for FCC metals) due to partial dislocation dissociation within grain boundaries, causing γ_GB(θ) to deviate from standard logarithmic form and acquire 1/γ_SF dependence. Above θ_c, A remains γ_SF-independent as A₀ dominates with standard Read-Shockley behaviour. The threshold marks a first-order structural transition in boundary dislocation character from perfect networks to dissociated partial structures.

**Derivation:** Dislocation spacing in a low-angle boundary is d_boundary = b/θ. Equilibrium partial separation is d_partial = Gb²/(8πγ_SF). Setting d_boundary = d_partial gives θ_c = 8πγ_SF/(Gb). When θ < θ_c, boundary dislocations are spaced widely enough that their partial dissociation width matters; the partial structure contributes a γ_SF-dependent term to boundary energy. Low γ_SF materials (copper alloys ≈ 45 mJ/m², austenitic stainless steels) show this regime more prominently, wider partial dissociation extends the deviation from Read-Shockley to higher misorientations.

**Verification:** Known physics, competently assembled from established results. Read & Shockley (1950) provides baseline. Dai et al. (ScienceDirect 2016) derived twist grain boundary energy including partial dissociation and stacking fault energy effects, showing dislocation structures determined by a single dimensionless parameter with perfect-dislocation and partial-dislocation network extremes. Rittner & Seidman investigated FCC tilt boundaries with low γ_SF via atomistic simulation, developing dislocation models of grain boundary dissociation. Equilibrium splitting distance formula d = Gb²/(8πγ_SF) is textbook dislocation theory. Individual components well-established; specific assembly into threshold criterion with quantitative coefficients is a synthesis of known results.

**Cross-domain bridge potential:** The sharp threshold behaviour (continuously varying parameter hits critical value → discontinuous change in defect structure) maps directly to: Matthews-Blakeslee critical thickness in epitaxy (node 4.6's crystal-002 partner, coherent→dislocated transition), MEEF divergence near resolution limit in photolithography (smooth feature scaling → abrupt error amplification), and DSA defectivity onset (ordered→defected self-assembly). All share the mathematical structure of a continuously tuned control parameter crossing a threshold where the system's structural character changes discontinuously. Seeded in semiconductor fab pool as crystal-004.

**Novelty:** Classical materials science. Individual results published (Read & Shockley 1950, Dai et al. 2016, Rittner & Seidman). Value is as a quantitative crystallography seed for the semiconductor fabrication project, provides a concrete threshold mechanism with known coefficients for synthesis to bridge to fabrication thresholds.

**Status:** **VERIFIED** - established physics with confirmed literature grounding (Read & Shockley 1950, Dai et al. 2016). Classical result; value as quantitative seed for cross-domain threshold-transition synthesis. March 2026.

---

## 5. External Literature Convergences

Instances where Podbit-generated hypotheses independently converged with published research.

### 5.1 Structured N:M Pruning + Stochastic Resonance

**Podbit prediction:** Networks using 2:4 structured pruning and dropout rates tuned to stochastic resonance peak will exhibit lower test loss than random sparsity or zero-dropout.

**Published paper:** 'Efficient and dynamic layer-wise structured N:M pruning of deep neural networks' - ScienceDirect

**Overlap:** Paper confirms structured mask patterns outperform random at equivalent sparsity, with dynamic layer-wise allocation. Same territory, different path.

**What Podbit adds:** Stochastic resonance + dropout tuning angle not covered in published work.

**Status:** **CONVERGED** - direction validated, extension prediction untested.

### 5.2 AMR-to-Attention Formalisation

**Podbit prediction:** Adaptive mesh refinement concentrating processing on high-information regions is analogous to attention mechanisms.

**Published work:** Yang et al. AISTATS 2023, Foucart et al. 2023, Freymuth et al. NeurIPS 2023/ICLR 2024 - RL/active learning connection operationalised.

**Overlap:** Active learning analogy formalised into working systems competitive with oracle error estimators. Attention connection remains qualitative.

**Status:** **CONVERGED** - partially formalised in literature.

---

## 6. Architectural Self-Discovery

### 6.1 Podbit as Genetic Algorithm

**Core insight:** Structural (not metaphorical) mapping of Holland's 1975 GA framework onto Podbit's synthesis engine. Population of nodes, temperature-weighted selection as fitness proxy, voicing as crossover, quality gates as evaluation, 5% acceptance as selection pressure.

**Predictions from GA theory:** Schema theorem for building block propagation, multi-parent recombination, island models with migration, niching/speciation for protecting subpopulations.

**Validation scores:** Synthesis 9, Novelty 7, Testability 9, Tension Resolution 7. Composite 8.0.

**Status:** **HYPOTHESIS** - structural mapping, predictions untested.

### 6.2 Podbit as Co-Evolutionary System

**Core insight:** Podbit is not a GA but something GAs deliberately avoid: a system where the fitness landscape co-evolves with the population. Compress/summarize generates system prompts FROM graph contents. As graph evolves, meta-prompt evolves, changing what model produces.

**Implication:** 5% acceptance rate is not convergence toward quality but dynamic equilibrium between moving population and moving fitness landscape. Open-ended evolution, not optimisation.

**Status:** **HYPOTHESIS** - conceptual framework, not empirically tested.

---

## 7. Biology

Bee neurobiology synthesis nodes exploring developmental-behavioral-metabolic cascades. These demonstrate the system's capacity for sophisticated biological reasoning while also illustrating characteristic LLM failure modes (fabricated gene names, unverified mechanistic assertions).

### 7.1 Pupal Chromatin → Foraging → Gut Metabolism Cascade

**Core claim:** Pupal chromatin accessibility of pectin-processing genes and doublesex (dsx) in developing mushroom bodies determines adult foraging propensity, which in turn determines pollen exposure and gut pectin degradation with TCA cycle upregulation.

**Original synthesis:** Referenced a gene called "Pect1" with chico-EcR signaling simultaneously regulating ecdysone response and pollen-specific pectinase. The gene name appears fabricated, no "Pect1" exists in bee genomics literature.

**Corrected interpretation:** If "Pect1" is understood as pectin methylesterase (a real enzyme class), the claim becomes biologically plausible. The corrected cascade: pupal chromatin accessibility of pectin-processing genes + dsx in developing mushroom bodies → adult foraging propensity → pollen exposure → gut pectin degradation + TCA upregulation.

**Experimental prediction:** Disrupted chromatin accessibility reduces foraging (less natural pollen exposure) but would not affect the gut's intrinsic capacity to process artificially provided pollen. Natural vs artificial pollen exposure differential becomes a clean test of whether the effect is behavioral or metabolic.

**Verified components:**
- Mushroom body role in foraging behavior and nurse-to-forager transition
- Chromatin accessibility differences between behavioral castes (ATAC-seq studies)
- TCA cycle metabolite upregulation from pollen consumption via gut bacteria
- Cooperative pectin digestion by Bifidobacterium (pectin methylesterase) and Gilliamella (pectinases)

**Status:** **HYPOTHESIS** - biologically literate speculation. Real systems, plausible cascade, fabricated gene name. Quality gates should flag novel gene names lacking literature support.

### 7.2 Wasp-to-Bee Transition: Parallel Co-option

**Core claim:** The wasp-to-bee transition required parallel co-option of mechanistically independent molecular systems: cryptic pectin methylesterase activity was neofunctionalized for pollen digestion while circadian clock circuitry was independently repurposed to gate macronutrient-specific foraging.

**Prediction:** Experimental period knockdown eliminates pollen-foraging peaks without affecting midgut pectinase enzyme activity levels.

**Verified foundation:**
- Real evolutionary transition: wasps are ancestral to bees, dietary shift from predation to pollen is established
- Circadian foraging systems exist in bees with known clock gene involvement
- Pectin digestion is a real requirement for pollen processing

**Assessment:** Sophisticated reasoning combining real evolutionary biology with plausible mechanistic predictions. The "cryptic" PME activity and specific neofunctionalization pathway are unverified assertions. The experimental prediction (period knockdown) is clean and testable.

**Status:** **HYPOTHESIS** - well-structured evolutionary prediction with unverified mechanistic specifics. March 2026.

**Overall Biology Assessment:** Both claims exhibit the same synthesis pattern: correctly identifying real biological systems, constructing sophisticated mechanistic chains, but incorporating fabricated molecular details and unverified evolutionary mechanisms. This represents biologically literate speculation rather than literature-grounded claims. The corrected interpretation of 7.1 demonstrates how synthesis quality can dramatically improve with proper molecular context.

---

## 8. Physics Simulation Analogues

Cross-domain mappings between physics engine mechanics and neural network training dynamics.

### 8.1 Two-Phase Correction: Velocity Integration Drift and Constraint Projection

**Node ID:** `9f12a7ff-0483-4276-87c1-93d480e8faf7`

**Core claim:** Physics engines and neural training both use two-phase correction where velocity-like integration errors accumulate until position-like projections reset drift. Gradient updates alone cannot maintain constraint satisfaction, explicit orthogonal projection onto generalization manifolds is mechanically required to prevent error accumulation.

**Structural mapping:** Gradient descent maps to velocity integration (accumulates drift from constraints). Explicit projection onto the generalization manifold maps to post-stabilization in constraint-based physics (resets drift). The claim is that the two-phase pattern is structurally necessary, not a regularization hack.

**EVM verification:** Two-phase (gradient + projection) vs gradient-only on a 10-dimensional linear constraint manifold. 200 steps, learning rate 0.1. Drift ratio: ~75,000x (gradient-only accumulated drift of 1308.4 vs two-phase drift of 0.018). Final constraint violation: gradient-only 6.87, two-phase 3.3e-16 (machine epsilon). Confidence 0.65, correctly calibrated as the test confirms the mathematical mechanism on linear manifolds but does not bridge to the neural training claim empirically.

**Actionable implications:**
- **Sparse network training:** don't rely on loss landscape to maintain sparsity constraints. Explicitly project back onto the sparse manifold periodically. Directly relevant to martensitic pruning work (Section 1).
- **Batch size interaction:** batch size affects the magnitude of the velocity integration step, which affects drift rate off constraint surfaces. Connects to McGlade relation (optimal batch sizing for sparse networks).
- **General design principle:** anywhere iterative refinement drifts from structural constraints, the prescription is periodic explicit projection. The two-phase pattern (accumulate then project) may transfer to other domains in the knowledge graph.

**Existing techniques that may be implicit projections:** Weight projection after pruning (snapping small weights to zero each epoch), projected gradient descent, orthogonal regularization in transformers. The node's contribution is identifying WHY these work through the physics lens, structural necessity from shared mathematics, not ad-hoc regularization.

**Caveat:** "Mechanically required" is a strong claim. The verification shows projection helps for linear constraints, but "required" implies no other mechanism could achieve the same result. Regularization, weight decay, and batch normalization all do constraint-like maintenance without explicit projection, whether these are implicit projections (supporting the claim) or genuinely different mechanisms (weakening it) is unresolved. Additionally, "generalization manifolds" is doing heavy lifting: in physics, constraint manifolds are well-defined geometric objects; in neural training, the set of parameter configurations that generalize well is not necessarily a smooth manifold.

**Status:** **SUPPORTED (EVM)** - mathematical mechanism confirmed with 75,000x drift ratio. Cross-domain claim plausible but not empirically validated on neural training. Confidence 0.65. March 2026.

### 8.2 Salvaged Thermodynamic Efficiency: Loss-Per-Oscillation Metric

**Node ID:** `3f622fed-d98b-4d60-b2dc-c21f5a198aad`

**Origin:** EVM recovery from a rejected thermodynamic cycle analogy. The parent node attempted to define optimization as a thermodynamic cycle with calculable efficiency. The cycle analogy failed structurally (no cyclicity, no equilibrium states, no reversibility, no conservation laws). This node salvages the useful output: the efficiency metric itself.

**Core claim:** The ratio loss_reduction/update_variance distinguishes optimizers by measuring loss-per-oscillation rather than true thermodynamic efficiency. This metric works without requiring the thermodynamic framing to be valid, it needs only that loss reduction and update variance are measurable quantities, which they always are during training.

**EVM verification:** Simulated low-variance optimizer (momentum SGD, lr=0.1, momentum=0.9) vs high-variance optimizer (vanilla SGD, lr=0.5, high noise). Metric values: low-variance efficiency 329.0, high-variance efficiency 0.2. Ratio: 1,328x separation. The metric cleanly distinguishes optimizer types across 10 trials. Confidence 0.65.

**What the metric actually measures:** Progress per unit of oscillation. A high value means the optimizer converts most of its update energy into loss reduction rather than bouncing around. This is useful for optimizer selection, hyperparameter tuning (find the learning rate that maximises the ratio), and detecting when an optimizer is wasting compute on variance rather than progress.

**Relationship to 8.1:** Complementary framing. Node 8.1 says gradient descent accumulates drift from constraints and needs explicit projection. This node provides a scalar diagnostic: loss_reduction/update_variance drops when the optimizer is drifting (high variance, low progress). A sudden drop in the metric during training could signal that projection (8.1) is needed. Together they give you both the diagnostic (8.2) and the prescription (8.1).

**Broader pattern:** This is a successful example of the pipeline's EVM recovery mechanism. The original thermodynamic cycle framing was rejected, but the rejection analysis identified a salvageable component. The metric survives because it has weaker preconditions than the analogy it came from, it only needs measurable quantities, not thermodynamic structure. This is exactly the kind of partial-credit extraction that distinguishes productive synthesis failure from pure noise.

**Status:** **SUPPORTED (EVM)** - metric validated with 1,328x separation between optimizer types. Salvaged from rejected thermodynamic cycle analogy. Confidence 0.65. March 2026.

### 8.3 Additive vs Multiplicative Memory Savings (EVM Recovery)

**Node ID:** `8a78f03b-872e-4725-92a9-35a859fd9b7d`

**Origin:** EVM recovery from a rejected claim that memory savings from Free Lunch transformers (activation optimisation) and parameter-efficient fine-tuning (PEFT) combine multiplicatively: combined_savings ≈ 1 - (1-savings_A)(1-savings_B) = savings_A + savings_B - savings_A×savings_B. The EVM disproved this and discovered a more fundamental pattern.

**Core finding:** Memory savings from activation optimisation (kernelized attention) and parameter optimisation (PEFT) combine ADDITIVELY, not multiplicatively. Combined savings ≈ savings_A + savings_B. Average deviation from additive model: 0.000000. Average deviation from multiplicative model: 0.006739. Additive model better in 4/5 tested configurations. The techniques are MORE effective together than the multiplicative prediction suggested.

**Key insight:** The structural mapping failed because "orthogonality" in mechanism does NOT imply "orthogonality" in resource consumption. Activation-efficient and parameter-efficient techniques operate on fundamentally separate memory pools (activation memory vs weight memory). When two optimisations target non-overlapping resources, their savings add directly rather than interacting multiplicatively. The multiplicative model implicitly assumes both techniques compete for the same memory pool, they do not.

**Quantitative result:** Additive model fits with 0.0000 average error vs 0.0067 for multiplicative across five configurations. Worst-case multiplicative deviation: config={batch_size: 64, seq_len: 256, hidden_dim: 1024, num_layers: 8}, error=0.0150 (1.5%). The additive fit is exact within simulation precision, not approximate.

**Practical implication:** Anyone stacking PEFT with activation-efficient architectures (kernelized attention, Flash Attention variants) can predict combined memory savings by simple addition, with a hard ceiling at 100%. The additive model is both simpler and more accurate than the multiplicative alternative. Combined savings are better than the multiplicative prediction, meaning the techniques are more effective together than commonly assumed.

**Broader pattern:** This is a clean example of the EVM recovery mechanism producing a discovery more interesting than the original claim. The pipeline predicted multiplicative combination, tested it, found it wrong, and the correction revealed a structural insight about memory pool separation that the original synthesis missed. The recovery narrative demonstrates the engine thinking, not just cataloguing known results, but actively correcting its own predictions and explaining why the correction matters.

**Caveat:** The additive model assumes clean separation of memory pools. In practice, there may be shared overhead (optimizer states, gradient buffers) that introduces minor interaction effects. The 0.0000 deviation is from the EVM simulation, not from hardware measurement. Real GPU memory allocation has fragmentation and alignment overhead that could produce small deviations from pure additivity. The qualitative finding (additive, not multiplicative, because separate pools) should transfer; exact zero deviation may not.

**Status:** **VERIFIED (EVM recovery)** - additive model confirmed with 0.0000 average deviation across five configurations. Confidence 100%. Disproved multiplicative combination; discovered non-overlapping memory pool structure. March 2026.

---

## 9. Rejected Nodes (For Reference)

Nodes that failed review. Retained as negative examples for quality gate calibration.

### 9.1 Quasiperiodic 5D Sparsity Masks

**Claim:** 5D hypercubic lattice projection yields weight mask with exactly 2:4 sparsity ratio requiring fewer active shafts than any periodic design.

**Test result:** Density 52.3% (not exact 50%). GF(2) rank 24 vs NVIDIA 2:4 rank 1. Quasiperiodic requires 24x MORE shafts than periodic. Claim is inverted. Long-range order not demonstrated at tested scales.

**Status:** **REJECTED** - structural similarity without functional correspondence.

### 9.2 Tollmien-Schlichting / CSL Depth-Reynolds

**Claim:** Networks with CSL sigma <= 29 transition to turbulent gradients at depth proportional to sigma, with critical N of 9-10 from e^N method.

**Issue:** Quantitative mapping between CSL sigma values and gradient flow Reynolds numbers has no derivation. Numbers from different fields asserted proportional without connecting mechanism. Qualitative prediction (structured sparsity interacts with depth to produce gradient flow transition) is salvageable; specific numerical mapping is numerology.

**Status:** **REJECTED** - qualitative hypothesis salvageable, quantitative claims unsupported.

### 9.3 Loom Crimp / Jamming Threshold

**Claim:** Sparsity exceeding planar-jamming threshold analogous to loom crimp curvature limits triggers learning-rate instability.

**Issue:** Fabricated connective tissue. No established correspondence between textile crimp mechanics and neural network sparsity thresholds. Circular synthesis repackaging 1-5% sparsity figure as jamming threshold.

**Status:** **REJECTED** - vocabulary assembly without causal grounding.

---

## 10. Convergence Log Template

Use this format for each new external convergence discovered.

| Field | Entry |
|---|---|
| Podbit Node ID | `[UUID]` |
| Date Generated | `[DD/MM/YYYY]` |
| Core Prediction | `[One sentence]` |
| Published Paper | `[Title, authors, venue, year]` |
| Date Published | `[DD/MM/YYYY]` |
| Overlap Type | `[Direction / Partial / Exact]` |
| What Podbit Adds | `[Extension beyond published work]` |

---

# New Sections — From `neuralnetworktraining` Project

The sections below extend the registry with high-weight synthesis nodes from the active `neuralnetworktraining` graph (1,231 nodes across statistical-physics, optimizer-algorithms, model-architecture-design, control-theory, neural-network-architectures, quantum-computing). Where the `ResonanceV2` triad above is rooted in materials science, this graph's centre of gravity is **stability theory** — the geometry of the loss-landscape Hessian, the noise covariance produced by adaptive optimisers, and the control-theoretic decoupling of learning rate from robustness margin.

---

## 11. The Edge-of-Stability Triad

Three top-weight synthesis nodes that together describe the dominant motif of this graph: λ_max(H)·η ≈ 2 as the single threshold linking optimiser, architecture, and gradient noise.

### 11.1 Adam-Induced Edge-of-Stability Drift in Depthwise-Separable Networks

**Node ID:** `12801bf5-a783-4ecf-9a17-2e0444ffe04f` *(synthesis, optimizer-algorithms, weight 1.62)*

**Core claim:** The Edge-of-Stability condition λ_max ≈ 2/η governs optimiser adaptation and architecture-dependent training stability. An increase in per-layer gradient variance (e.g. from Adam's adaptation in depthwise-separable nets at 2x LR) locally raises the *effective* η, pushing λ_max toward the stability boundary. This predicts that training such a network with β₁=0.9 will, within a measurable epoch budget, produce a 5-15% increase in gradient variance in a bottleneck layer, causing its largest Hessian eigenvalue to approach 2/(η_eff).

**Key insight:** Edge-of-Stability is not a curiosity that emerges late in training — it is the *mechanism* through which adaptive optimisers and architectural gradient-attenuation patterns interact. Per-parameter learning-rate variance from Adam's second moment is the hidden multiplier on the effective Hessian.

**Prediction:** A bottleneck layer in a depthwise-separable network at 2× LR with Adam will exhibit λ_max(H) approaching 2/η_eff *before* the standard convolution baseline at the same nominal LR, with a quantifiable lead in epochs.

**Status:** **HYPOTHESIS** — synthesis from established Edge-of-Stability literature (Cohen et al.) and Adam preconditioner theory; testable with standard Hessian-trace probes during training.

### 11.2 Hessian Condition Number as Joint Stability Threshold

**Node ID:** `eb785eaa-0aae-4439-9d51-72addbed7464` *(synthesis, model-architecture-design, weight 1.46)*

**Core claim:** The Hessian condition number κ(H) and its largest eigenvalue λ_max jointly determine the threshold at which L-BFGS overtakes Adam. The crossover κ* coincides with λ_max(H) crossing a critical value proportional to β/C (β = momentum, C = clipping), a threshold which simultaneously triggers divergence in adaptive preconditioners *and* makes residual connections necessary to prevent collapse.

**Key insight:** "When to switch optimiser" and "when to add skip connections" are not two design decisions but one. The same spectral threshold governs both. Architectural and algorithmic interventions are interchangeable means to the same end: keeping λ_max·η below the stability limit.

**Prediction:** Measure κ(H) periodically; the epoch at which Adam validation loss first exceeds L-BFGS validation loss will fall within a small window of the epoch at which a residual-free baseline first diverges. If decoupled, the joint-threshold claim fails.

**Status:** **HYPOTHESIS** — cross-domain (architecture ↔ optimiser) prediction with a sharp falsification criterion.

### 11.3 Lyapunov Adaptation in a Low-Rank Subspace

**Node ID:** `0d1d899d-9430-420f-a7a0-b59499b6c8d3` *(synthesis, control-theory, weight 1.34)*

**Core claim:** A Lyapunov-based learning-rate rule λ_k = λ₀ / (1 + α·‖H_lowrank‖_F), where H_lowrank is the L-BFGS Hessian approximation restricted to a LoRA subspace, can be derived from L1 adaptive control's decoupled adaptation principle. The rule predicts a measurable reduction in epochs to target validation accuracy on transformer fine-tuning, while keeping loss spikes bounded and using less optimiser-state memory than full-parameter second-order methods.

**Connection to triad:** 11.1 says Adam *drifts toward* the Edge of Stability. 11.2 says crossing it forces an architectural or algorithmic switch. 11.3 prescribes the switch: a Lyapunov-stable, low-rank adaptation that bounds the drift before it becomes a divergence.

**Status:** **HYPOTHESIS** — full closed-form rule, testable on standard fine-tuning benchmarks (LoRA + transformer fine-tune is a common harness).

**Combined theory.** The triad replaces "tune Adam, hope for the best" with a stability-margin discipline: monitor λ_max(H), recognise the 2/η ceiling as a hard wall (11.1), accept that architecture and optimiser are interchangeable controls on the same wall (11.2), and apply a Lyapunov-decoupled adaptation when the wall is approached (11.3). Only 11.1 has direct empirical antecedents in the literature; 11.2 and 11.3 are graph-native predictions.

---

## 12. Quantum–Classical Noise Convergence

A coherent line of synthesis showing that variational quantum optimisation and classical SGD share the same anisotropic-noise structure — a candidate for external literature convergence in the spirit of Section 5.

### 12.1 Anisotropic Gradient Noise as Shared Mechanism

**Node ID:** `6173e3d8-4cef-4c8f-b864-61885257658c` *(synthesis, quantum-computing, weight 1.34)*

**Core claim:** Both quantum optimisation and classical neural-network training exhibit anisotropic gradient noise in which variance scales inversely with Hessian curvature (Var ∝ 1/λ_i). This shared mechanism predicts that L2 regularisation in quantum circuits will suppress noise amplification along *flat* directions (the "narrow ravines" of variational landscapes), testable by measuring gradient variance along Hessian eigenvectors before and after regularisation.

**Key insight:** Shot noise in PQCs is not generic noise — it is curvature-anisotropic noise, structurally identical to SGD's stationary covariance. The implication is that classical regularisation principles (weight decay, sharpness penalties) port over to quantum circuits without re-derivation.

**Status:** **HYPOTHESIS** — testable on existing variational quantum eigensolver (VQE) hardware with classical Hessian probes.

### 12.2 Fubini-Study Stability Bound for Quantum Natural Gradient

**Node ID:** `8e538db5-c5bc-406d-96ec-e20fef06edf0` *(synthesis, quantum-computing, weight 1.20)*

**Core claim:** The depthwise-separable stability bound η_max = c / (λ_max · √(1 + r²)) lifts directly to Quantum Natural Gradient: η_max^QNG = c / (λ_max^G · √(1 + (r^G)²)), where G is the Fubini-Study metric, λ_max^G its largest eigenvalue, and r^G off-diagonal coupling. Measuring G's spectrum directly yields the stability threshold for QNG on parameterised quantum circuits.

**Key insight:** The Fubini-Study metric is to quantum circuits what the Hessian is to classical loss surfaces. Stability bounds derived from one transfer to the other under the same √(1+r²) coupling penalty.

**Status:** **HYPOTHESIS** — sharper than 12.1 because it gives a closed-form bound; falsifiable by direct measurement of G's eigenvalues during QNG runs.

### 12.3 FIM-Decay Equivalence: Clipped SGD ↔ Quantum Natural Gradient

**Node ID:** `5f662222-5099-473f-8c8e-864158898c77` *(synthesis, quantum-computing, weight 1.20)*

**Core claim:** Both regimes are governed by the eigenvalue spectrum of the Fisher Information Matrix. Polynomial NTK (FIM analogue in classical networks) reduces trace(H·Σ) in clipped SGD; QNG, which uses the quantum FIM, mitigates shot noise. Shared mechanism: FIM eigenvalue distribution governs noise resilience. Prediction: in classical networks with polynomial FIM decay, clipped SGD will exhibit noise reduction *quantitatively comparable* to QNG in PQCs, measurable by tracking trace(FIM) per epoch in both systems.

**Status:** **HYPOTHESIS** — direct cross-domain prediction with an instrumented protocol (track trace(FIM) in both training runs, compare).

**Cross-domain framing.** Where the PDF's Section 4 finds novel cross-domain bridges in materials science and weaving, this triple builds a parallel bridge between **classical SGD and variational quantum optimisation** through the shared structure of curvature-anisotropic noise. If 12.1–12.3 hold, the engineering implication is that quantum optimiser design can borrow directly from classical preconditioning theory rather than reinventing it.

---

## 13. Heavy-Tailed Gradients and Curvature-Aware Clipping

The graph's most concrete actionable prediction: a closed-form clipping rule grounded in the heavy-tailed structure of real gradient distributions.

### 13.1 Power-Law Exponent Determines Optimal Clipping Threshold

**Node ID:** `696b8b36-17f8-4cf2-83b7-9c98d03ae78d` *(synthesis, statistical-physics, weight 1.46)*

**Core claim:** The heavy-tailed gradient distribution's power-law exponent α determines the variance of local curvature σ²_curv,t via Var[g_t] ∝ (α-2)⁻¹ for α > 2. Since σ²_curv,t can be estimated from a moving window of gradient differences, the optimal curvature-aware clipping threshold scales as τ_t = c · √((α-2)⁻¹). For measured α > 2, the empirically optimal clipping threshold should decrease proportionally to 1/√(α-1).

**Key insight:** Standard gradient clipping uses a fixed threshold, but real gradients are heavy-tailed (Şimşekli et al. 2019). The α exponent is observable from gradient histograms; the rule above turns it into an automatic per-step clipping schedule with no extra hyperparameter.

**Prediction:** Two networks identical except for clipping schedule — one fixed, one τ_t = c · √((α-2)⁻¹) with α estimated online — should diverge in validation accuracy proportional to the variance of α across training.

**Status:** **HYPOTHESIS** — closed-form, falsifiable, and uses only quantities that are already cheap to measure during training.

### 13.2 Architecture-Conditioned Clipping Threshold Scaling

**Node ID:** `bad27b59-7e09-4289-ac55-040a34aba16b` *(synthesis, optimizer-algorithms, weight 1.46)*

**Core claim:** The gradient norm variance across layers, Var(‖∇L‖), induced by architectural changes (e.g. depthwise-separable vs standard convolution), predicts the optimal gradient-clipping threshold via a scaling law τ = k · √Var(‖∇L‖). For two architecturally variant networks trained to the same accuracy, setting clipping thresholds according to this law yields *identical* convergence-stability curves.

**Connection to 13.1:** 13.1 derives the time-axis schedule from heavy-tail exponent α; 13.2 derives the layer/architecture-axis threshold from gradient-norm variance. Together they form a 2-D adaptive clipping rule: per-layer scale by √Var(‖∇L‖), per-step modulate by √((α-2)⁻¹).

**Status:** **HYPOTHESIS** — instrumented protocol straightforward (per-layer gradient stats are already collected by most training frameworks).

### 13.3 Lévy-Stable Noise and Adam–L-BFGS Sparsity Divergence

**Node ID:** `d665122f-7d40-4a63-8925-f1a7b97b8e01` *(synthesis, optimizer-algorithms, weight 1.44)*

**Core claim:** The shared mechanism is modification of effective gradient magnitude by curvature-aware preconditioning *before* regularisation applies. For layers with Lévy-stable gradient noise (α < 2), the ratio of sparsity induced by Adam vs L-BFGS, under identical clipping and weight decay, will correlate with the layer's measured preconditioned gradient kurtosis and diverge measurably within a finite epoch budget.

**Key insight:** The order in which curvature preconditioning, clipping, and weight decay are composed matters more than usually assumed — and the magnitude of this composition-order effect is *predictable* from the layer's gradient-kurtosis statistics.

**Status:** **HYPOTHESIS** — bridges Şimşekli's Lévy-noise framework with the Adam/L-BFGS sparsity comparison; requires per-layer kurtosis tracking.

**Practical bundle.** 13.1–13.3 collectively answer: *what should the clipping threshold be, and how should it change over training and across layers?* The answer is closed-form, requires no extra hyperparameters beyond a single scale constant, and is falsifiable by running a single A/B experiment with online α-estimation.

---

## 14. Graph-Native Verified Breakthrough

The single user-promoted breakthrough in the active graph — included for completeness as the only node currently carrying explicit validation scores in the `neuralnetworktraining` project.

### 14.1 Serial 1×1 Convolution Memory–Curvature Trade-off

**Node ID:** `38b7302e-4b27-45ef-ac2f-2c5d7908184a` *(breakthrough, neural-network-architectures, weight 1.30)*

**Core claim:** Serial (cascaded) grouping of 1×1 convolutions reduces peak activation memory by ≈65% compared to parallel dense layers, but the sequential dependency creates "gradient deadlock" where L-BFGS curvature estimation fails, necessitating a switch to diagonal approximation methods like Adafactor.

**Key insight:** Memory–curvature trade-off, made explicit. Serial 1×1 cascades save activation memory but corrupt the curvature signal that quasi-Newton methods rely on. The fix is *not* to abandon the architecture but to switch the optimiser to one whose curvature estimate degrades gracefully (Adafactor's diagonal preconditioner is robust to gradient-deadlock conditions that break L-BFGS).

**Validation scores:** Synthesis 7, Novelty 7, Testability 5, Tension Resolution 5. Composite **6.3**. Promoted via GUI.

**Status:** **BREAKTHROUGH (validated)** — the only user-promoted node in the active graph as of April 2026. Generation-0 research-cycle origin with 6 children.

---

*New sections drawn from the active graph by querying `neuralnetworktraining` for `nodeType=synthesis` ordered by weight, restricted to weight ≥ 0.9 (278 candidates) and the single `breakthrough` node. Selection prioritised cross-domain triads to mirror the registry's existing structure: Edge-of-Stability (11), quantum–classical noise (12), heavy-tailed clipping (13).*
