---
novelSlug: the-latency-of-tomorrow
slug: chapter-63
number: 63
title: "The Smallest Reliable Model"
publishedAt: "2026-10-27"
description: "The Indian pilot begins with a narrow fault-detection model designed to be understood, checked and maintained by the factory's own engineers."
---

Mei rejected the largest model before it finished its first training run.

The proposed system combined high-resolution images, vibration patterns, maintenance history and operator notes. It produced a convincing demonstration on the few examples the team had gathered. It also required a continuous stream of data Arjun's factory could not reliably supply.

“Try removing three of the inputs,” Mei said.

Guo's technical analyst stared at her.

“Wouldn't that make it less accurate?”

“Let's find out whether the accuracy is real.”

They began with one machine group and a single defect category: an identifiable surface mark that sometimes appeared after a tool began to wear. The factory had photographs of inspected parts and records of some tool changes. The labels had been checked by Leela and another technician. The rest were uncertain.

Yanchuan suggested discarding uncertain samples from the first measurement of performance rather than assigning guessed outcomes. Mei agreed, but insisted the discarded count appear in the report. A model that worked beautifully on the cleanest fraction of the data did not necessarily work on the line's entire output.

The first small classifier used ordinary measured features and a few image-derived patterns. It ran on a local computer. Its result was a request for inspection, not a verdict that a part was safe or defective.

Leela tested it during an approved demonstration. It correctly flagged several known marks. It missed a subtle defect she recognized from the angle of a reflection. She showed Mei how turning the part under the workshop light made the evidence clearer.

“That view isn't in your training images,” she said.

“Then we need better images,” Mei answered. “Not a story about the model learning to see what wasn't recorded.”

They tried a simple change in the imaging setup. The result improved more than a week of tuning had managed.

Arjun wanted to know whether the model could inspect every part without human involvement. Yanchuan showed the evaluation plan. It measured the rate of missed known defects, the burden of false warnings and the time required for operators to check the result. It did not yet support an unattended inspection process.

“Could it eventually?” Arjun asked.

“Perhaps. The question is what you would need to prove first.”

The pilot remained advisory.

In Shenzhen Chen reviewed the cost. The smallest model was cheaper to maintain and easier for the local team to inspect. It could run when the external connection failed. It also lacked the impressive features vendors used in sales presentations.

Guo asked what they would say in the brochure.

“It's a tool that points out certain marks for trained staff to check,” Mei replied.

“Not intelligent inspection?”

“Call it whatever you like after the technical sentence remains intact.”

They settled on a description that named the defect category, required image conditions and human review. The marketing team complained that it sounded modest. Arjun said modest was preferable to paying for a machine that promised to replace knowledge it did not contain.

At night Yanchuan called An. Their son had begun learning about simple machines at school and wanted to know whether a lever could lift a heavier weight than the child could carry.

“Yes, with the right arrangement,” Yanchuan said.

“Then why doesn't it make me stronger?”

“It changes how your effort is used.”

The boy considered this, then asked whether a computer did something similar to thinking.

“Sometimes,” Yanchuan replied. “It can make some jobs easier. That doesn't mean it knows everything about the job.”

An interrupted to tell him their son was supposed to be asleep. The boy protested that the conversation counted as science homework.

In the factory, the next trial ran with local technicians controlling the process. They could correct a label, reject a warning and annotate a pattern the model did not recognize. Those decisions were recorded without assigning them the status of machine error or human error until the evidence had been reviewed.

Leela found one misleading training label. A photograph marked defective had been taken after a part was damaged during handling, not during the production stage being studied. They moved it into the appropriate category and reran the evaluation.

The headline score fell slightly. Arjun accepted the correction.

“Now I know which problem it's helping me solve,” he said.

The first milestone payment arrived after the local team approved the demonstrated scope. Guo asked whether they should invest in a larger model for the second phase.

Mei recommended waiting until the factory could show why the added complexity would be valuable. Ning proposed a comparison against the simple system under a new set of operating conditions.

Yanchuan wrote the recommendation. It felt unusual to be paid for saying a small machine might be enough.

On his last evening in Pune, Leela invited the visitors to watch the shift handover. The outgoing technician read the unresolved observations aloud while the incoming team checked the notes against the machines still in use. The model's warnings occupied one section of the page. They did not replace the handover.

When Yanchuan returned to Shenzhen, Leela sent a maintenance entry made without asking him for help. It named a failed inspection, the human review and the correction applied before the next shift. The small model had not prevented every uncertain result. The factory knew how to handle one.
