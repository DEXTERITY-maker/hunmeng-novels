---
novelSlug: the-latency-of-tomorrow
slug: chapter-72
number: 72
title: "The Price of the Default"
publishedAt: "2026-10-27"
description: "A small software default silently changes factory decisions, revealing that preset choices can carry commercial and safety consequences."
---

The default was a checked box beside a recommendation.

An operator could uncheck it before approving the nightly planning batch. The box said include flexible loads. The software had carried that setting forward from the previous test because it had been convenient for the engineering team.

Gao noticed the problem during a routine review. A newly added ventilation load appeared in a schedule of equipment available for shifting, even though nobody had authorized treating it as flexible.

The program had not switched anything. The operator had rejected the proposed schedule. But the default had turned the absence of a new decision into apparent permission.

“Who checked that box?” Gao asked.

Ning looked at the version history.

“We did, in the demonstration environment.”

“Then why is it on this screen?”

The teams had copied a configuration into the next pilot stage without requiring the owner of each load to review it. A flag originally used for testing had become part of an operational interface.

Yanchuan wrote the defect in the project log. It was not enough to say no harm occurred. The review needed to establish why the default survived and how future configuration changes would be authorized.

Ning removed the assumed permission. New loads would be treated as unavailable to shift until an identified owner confirmed the conditions. Existing approvals would have an expiry date tied to the operating context.

Guo worried that the extra confirmations would make the system slower.

“They will,” Gao said. “You're asking for the right to make suggestions about equipment we have to keep safe.”

The commercial manager suggested a single acceptance screen for all loads. The safety officer refused. Different equipment had different owners, and one click could hide decisions no person at the screen was qualified to make.

The revised interface displayed the reason a load was eligible and the date of its last approval. An operator could see what authority the recommendation relied on instead of assuming the checked box represented an enduring fact.

At the factory in Pune, Mei encountered a related default. The inspection model automatically added images of rejected parts to a training queue. Some had been rejected because the image was unusable, not because the manufactured component was defective. If the queue treated every rejection as a defect label, the next model would learn from a mistake.

Leela asked whether the queue could keep the reason for rejection.

“Yes,” Mei said. “And the default should be not to train on a label until it's been verified.”

That change cost time. It also prevented the system from turning a convenient interaction into a claim about the physical world.

Yanchuan told An about both problems. She laughed without amusement.

“My accounting software marks invoices paid when they're exported to the bank. Somebody still has to check the bank accepted them.”

“Can you change it?”

“We had the vendor change the label to submitted. They said paid looked friendlier.”

The same difference had haunted the missing-person inquiry: booked travel mistaken for a traveller, a returned badge mistaken for a departure, a filed request mistaken for completed work.

A default could be a very small decision made once and repeated by people who never met its maker.

The next week Gao tested the revised configuration. He added a hypothetical load with no approved flexibility conditions. The system did not recommend shifting it. He then entered an authorized scenario with a narrow operating window. The recommendation appeared only within that window and identified who had approved the condition.

“Better,” he said.

Yanchuan asked whether the screen needed a separate warning about stale data.

“It needs to show when it last knew the thing it claims to know.”

Ning added the timestamp beside the approval, not in a hidden technical panel.

Guo reviewed the release and asked whether the default change had reduced the savings estimate.

“Yes,” Yanchuan said.

“Then explain why.”

“Because we stopped assuming that silence meant consent.”

The sentence traveled into the product documentation. It was not a slogan. It described exactly what the program would do when an operator had not authorized a decision.

At home An's son was asked whether he wanted to keep his toy bridge assembled for another week. He shrugged. An asked again in words that made the choice clear: did he want it left in the living room or put away?

“Leave it,” he said.

She smiled at Yanchuan over the video call.

“See? Sometimes the expensive software problem is asking the question.”

He watched the boy lift the bridge away from the doorway so nobody would trip. An asked her son to move the bridge before somebody tripped. He did it grudgingly, then made a sign reminding everyone where it belonged.
